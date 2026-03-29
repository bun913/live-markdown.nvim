package message

import "encoding/json"

// NvimMessage represents messages from Neovim via stdin (JSON Lines).
type NvimMessage struct {
	Type       string `json:"type"`
	BufID      int    `json:"bufId,omitempty"`
	Text       string `json:"text,omitempty"`
	BaseDir    string `json:"baseDir,omitempty"`
	TopLine    int    `json:"topLine,omitempty"`
	CursorLine int    `json:"cursorLine,omitempty"`
}

// BrowserMessage represents messages sent to the browser via WebSocket.
type BrowserMessage struct {
	Type       string `json:"type"`
	HTML       string `json:"html,omitempty"`
	TargetLine int    `json:"targetLine,omitempty"`
}

// ServerMessage represents messages sent to Neovim via stdout (JSON Lines).
type ServerMessage struct {
	Type string `json:"type"`
	Port int    `json:"port,omitempty"`
}

// ParseNvimMessage parses a JSON line into a NvimMessage.
func ParseNvimMessage(line []byte) (NvimMessage, error) {
	var msg NvimMessage
	err := json.Unmarshal(line, &msg)
	return msg, err
}
