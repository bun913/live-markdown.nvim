package jsonlines

import (
	"encoding/json"
	"io"
	"sync"
)

// Writer writes JSON Lines to an io.Writer with mutex protection.
type Writer struct {
	w  io.Writer
	mu sync.Mutex
}

// NewWriter creates a new JSON Lines writer.
func NewWriter(w io.Writer) *Writer {
	return &Writer{w: w}
}

// Write marshals v as JSON and writes it as a single line.
func (jw *Writer) Write(v any) error {
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	data = append(data, '\n')
	jw.mu.Lock()
	defer jw.mu.Unlock()
	_, err = jw.w.Write(data)
	return err
}
