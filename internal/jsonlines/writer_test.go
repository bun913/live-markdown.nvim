package jsonlines

import (
	"bytes"
	"strings"
	"testing"
)

func TestWriter_Write(t *testing.T) {
	var buf bytes.Buffer
	w := NewWriter(&buf)

	msg := struct {
		Type string `json:"type"`
		Port int    `json:"port"`
	}{Type: "ready", Port: 8080}

	if err := w.Write(msg); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	output := buf.String()
	if !strings.HasSuffix(output, "\n") {
		t.Error("expected trailing newline")
	}
	if !strings.Contains(output, `"type":"ready"`) {
		t.Errorf("expected type=ready, got: %s", output)
	}
	if !strings.Contains(output, `"port":8080`) {
		t.Errorf("expected port=8080, got: %s", output)
	}
}

func TestWriter_MultipleWrites(t *testing.T) {
	var buf bytes.Buffer
	w := NewWriter(&buf)

	w.Write(map[string]string{"type": "a"})
	w.Write(map[string]string{"type": "b"})

	lines := strings.Split(strings.TrimSpace(buf.String()), "\n")
	if len(lines) != 2 {
		t.Errorf("expected 2 lines, got %d", len(lines))
	}
}
