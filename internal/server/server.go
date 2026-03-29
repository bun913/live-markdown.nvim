package server

import (
	"context"
	"embed"
	"encoding/json"
	"log"
	"mime"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/bun913/live-markdown.nvim/internal/jsonlines"
	"github.com/bun913/live-markdown.nvim/internal/markdown"
	"github.com/bun913/live-markdown.nvim/internal/message"
	"nhooyr.io/websocket"
)

// Server is the preview HTTP/WebSocket server.
type Server struct {
	clientFS embed.FS
	staticFS embed.FS
	nvimOut  *jsonlines.Writer
	mu       sync.Mutex
	clients  map[*websocket.Conn]context.CancelFunc
	lastHTML string
	baseDir  string
}

// New creates a new Server.
func New(clientFS, staticFS embed.FS, nvimOut *jsonlines.Writer) *Server {
	return &Server{
		clientFS: clientFS,
		staticFS: staticFS,
		nvimOut:  nvimOut,
		clients:  make(map[*websocket.Conn]context.CancelFunc),
	}
}

// ListenAndServe starts the HTTP server on a random port and returns the port.
func (s *Server) ListenAndServe(ctx context.Context) (int, error) {
	ln, err := net.Listen("tcp", "localhost:0")
	if err != nil {
		return 0, err
	}
	port := ln.Addr().(*net.TCPAddr).Port

	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleRoot)

	srv := &http.Server{Handler: mux}
	go func() {
		<-ctx.Done()
		srv.Close()
	}()
	go func() {
		if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
			log.Printf("server error: %v", err)
		}
	}()

	return port, nil
}

func (s *Server) handleRoot(w http.ResponseWriter, r *http.Request) {
	// WebSocket upgrade
	if r.Header.Get("Upgrade") == "websocket" {
		s.handleWebSocket(w, r)
		return
	}

	path := r.URL.Path

	// Local image files
	if strings.HasPrefix(path, "/_local/") {
		s.handleLocalFile(w, r)
		return
	}

	// Static assets: /css/*, /fonts/*, /js/*
	if strings.HasPrefix(path, "/css/") || strings.HasPrefix(path, "/fonts/") || strings.HasPrefix(path, "/js/") {
		s.serveEmbedded(w, r, s.staticFS, "static", path)
		return
	}

	// Vendor path compatibility: /vendor/mermaid.min.js -> /js/mermaid.min.js
	if path == "/vendor/mermaid.min.js" {
		s.serveEmbedded(w, r, s.staticFS, "static", "/js/mermaid.min.js")
		return
	}

	// Client files
	clientPath := path
	if clientPath == "/" {
		clientPath = "/index.html"
	}
	s.serveEmbedded(w, r, s.clientFS, "client", clientPath)
}

func (s *Server) serveEmbedded(w http.ResponseWriter, r *http.Request, fsys embed.FS, prefix, path string) {
	filePath := prefix + path
	data, err := fsys.ReadFile(filePath)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	ct := mime.TypeByExtension(filepath.Ext(path))
	if ct == "" {
		ct = "application/octet-stream"
	}
	w.Header().Set("Content-Type", ct)
	w.Write(data)
}

func (s *Server) handleLocalFile(w http.ResponseWriter, r *http.Request) {
	encoded := strings.TrimPrefix(r.URL.Path, "/_local/")
	decoded, err := url.PathUnescape(encoded)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	cleaned := filepath.Clean(decoded)
	data, err := os.ReadFile(cleaned)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	ct := mime.TypeByExtension(filepath.Ext(cleaned))
	if ct == "" {
		ct = "application/octet-stream"
	}
	w.Header().Set("Content-Type", ct)
	w.Write(data)
}

// --- WebSocket ---

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: true,
	})
	if err != nil {
		return
	}

	ctx, cancel := context.WithCancel(r.Context())
	s.addClient(conn, cancel)

	// Send cached HTML on connect
	s.mu.Lock()
	html := s.lastHTML
	s.mu.Unlock()
	if html != "" {
		data, _ := json.Marshal(message.BrowserMessage{Type: "render", HTML: html})
		conn.Write(ctx, websocket.MessageText, data)
	}

	// Read loop (discard incoming messages, detect disconnect)
	for {
		_, _, err := conn.Read(ctx)
		if err != nil {
			break
		}
	}
	s.removeClient(conn)
}

func (s *Server) addClient(conn *websocket.Conn, cancel context.CancelFunc) {
	s.mu.Lock()
	s.clients[conn] = cancel
	first := len(s.clients) == 1
	s.mu.Unlock()
	if first {
		s.nvimOut.Write(message.ServerMessage{Type: "connected"})
	}
}

func (s *Server) removeClient(conn *websocket.Conn) {
	s.mu.Lock()
	if cancel, ok := s.clients[conn]; ok {
		cancel()
		delete(s.clients, conn)
	}
	empty := len(s.clients) == 0
	s.mu.Unlock()
	conn.Close(websocket.StatusNormalClosure, "")
	if empty {
		s.nvimOut.Write(message.ServerMessage{Type: "disconnected"})
	}
}

func (s *Server) broadcast(msg message.BrowserMessage) {
	if msg.Type == "render" {
		s.mu.Lock()
		s.lastHTML = msg.HTML
		s.mu.Unlock()
	}
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	s.mu.Lock()
	clients := make([]*websocket.Conn, 0, len(s.clients))
	for c := range s.clients {
		clients = append(clients, c)
	}
	s.mu.Unlock()
	for _, c := range clients {
		c.Write(context.Background(), websocket.MessageText, data)
	}
}

// HandleNvimMessage processes a message from Neovim.
func (s *Server) HandleNvimMessage(msg message.NvimMessage) (shouldExit bool) {
	switch msg.Type {
	case "content":
		if msg.BaseDir != "" {
			s.mu.Lock()
			s.baseDir = msg.BaseDir
			s.mu.Unlock()
		}
		html := markdown.Render(msg.Text)
		s.mu.Lock()
		baseDir := s.baseDir
		s.mu.Unlock()
		html = markdown.RewriteImagePaths(html, baseDir)
		s.broadcast(message.BrowserMessage{Type: "render", HTML: html})
	case "scroll":
		s.broadcast(message.BrowserMessage{Type: "scroll", TargetLine: msg.CursorLine})
	case "close":
		s.broadcast(message.BrowserMessage{Type: "close"})
		return true
	}
	return false
}

// Shutdown sends close to all browser clients.
func (s *Server) Shutdown() {
	s.broadcast(message.BrowserMessage{Type: "close"})
}

func init() {
	// Register additional MIME types
	for ext, ct := range map[string]string{
		".woff2": "font/woff2",
		".woff":  "font/woff",
	} {
		mime.AddExtensionType(ext, ct)
	}
	// Suppress log prefix
	log.SetFlags(0)
	log.SetOutput(os.Stderr)
}
