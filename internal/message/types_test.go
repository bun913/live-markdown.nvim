package message

import (
	"testing"
)

func TestParseNvimMessage_Content(t *testing.T) {
	line := []byte(`{"type":"content","bufId":1,"text":"# Hello","baseDir":"/home/user"}`)
	msg, err := ParseNvimMessage(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if msg.Type != "content" {
		t.Errorf("expected type=content, got %s", msg.Type)
	}
	if msg.BufID != 1 {
		t.Errorf("expected bufId=1, got %d", msg.BufID)
	}
	if msg.Text != "# Hello" {
		t.Errorf("expected text=# Hello, got %s", msg.Text)
	}
	if msg.BaseDir != "/home/user" {
		t.Errorf("expected baseDir=/home/user, got %s", msg.BaseDir)
	}
}

func TestParseNvimMessage_Scroll(t *testing.T) {
	line := []byte(`{"type":"scroll","bufId":1,"topLine":10,"cursorLine":15}`)
	msg, err := ParseNvimMessage(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if msg.Type != "scroll" {
		t.Errorf("expected type=scroll, got %s", msg.Type)
	}
	if msg.CursorLine != 15 {
		t.Errorf("expected cursorLine=15, got %d", msg.CursorLine)
	}
}

func TestParseNvimMessage_Close(t *testing.T) {
	line := []byte(`{"type":"close","bufId":1}`)
	msg, err := ParseNvimMessage(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if msg.Type != "close" {
		t.Errorf("expected type=close, got %s", msg.Type)
	}
}

func TestParseNvimMessage_Invalid(t *testing.T) {
	_, err := ParseNvimMessage([]byte("not json"))
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}
