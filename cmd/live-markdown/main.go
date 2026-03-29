package main

import (
	"context"
	"os"

	livemarkdown "github.com/bun913/live-markdown.nvim"
	"github.com/bun913/live-markdown.nvim/internal/jsonlines"
	"github.com/bun913/live-markdown.nvim/internal/message"
	"github.com/bun913/live-markdown.nvim/internal/server"
)

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	nvimOut := jsonlines.NewWriter(os.Stdout)

	srv := server.New(livemarkdown.ClientFS, livemarkdown.StaticFS, nvimOut)

	port, err := srv.ListenAndServe(ctx)
	if err != nil {
		os.Exit(1)
	}

	// Notify Neovim of the assigned port
	nvimOut.Write(message.ServerMessage{Type: "ready", Port: port})

	// Read stdin (JSON Lines) — exits on EOF (defense line 2)
	msgCh := make(chan message.NvimMessage, 16)
	go jsonlines.ReadStdin(os.Stdin, msgCh)

	for msg := range msgCh {
		if srv.HandleNvimMessage(msg) {
			break
		}
	}

	// stdin closed or close message received — shut down
	srv.Shutdown()
	os.Exit(0)
}
