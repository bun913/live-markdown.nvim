package jsonlines

import (
	"bufio"
	"io"
	"strings"

	"github.com/bun913/live-markdown.nvim/internal/message"
)

// ReadStdin reads JSON Lines from r and sends parsed messages to ch.
// Closes ch when r is exhausted (stdin EOF = Neovim exited).
func ReadStdin(r io.Reader, ch chan<- message.NvimMessage) {
	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		msg, err := message.ParseNvimMessage([]byte(line))
		if err != nil {
			continue
		}
		ch <- msg
	}
	close(ch)
}
