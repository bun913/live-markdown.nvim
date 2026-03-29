package markdown

import (
	"strings"
	"testing"
)

func TestRender_Heading(t *testing.T) {
	html := Render("# Hello")
	if !strings.Contains(html, "<h1") {
		t.Errorf("expected <h1>, got: %s", html)
	}
	if !strings.Contains(html, "Hello") {
		t.Errorf("expected Hello, got: %s", html)
	}
}

func TestRender_Bold(t *testing.T) {
	html := Render("**bold**")
	if !strings.Contains(html, "<strong>bold</strong>") {
		t.Errorf("expected <strong>bold</strong>, got: %s", html)
	}
}

func TestRender_Strikethrough(t *testing.T) {
	html := Render("~~deleted~~")
	if !strings.Contains(html, "<del>deleted</del>") {
		t.Errorf("expected <del>deleted</del>, got: %s", html)
	}
}

func TestRender_TaskList(t *testing.T) {
	html := Render("- [x] done\n- [ ] todo")
	if !strings.Contains(html, `type="checkbox"`) {
		t.Errorf("expected checkbox input, got: %s", html)
	}
	if !strings.Contains(html, "checked") {
		t.Errorf("expected checked attribute, got: %s", html)
	}
}

func TestRender_FencedCodeBlock(t *testing.T) {
	html := Render("```go\nfmt.Println(\"hello\")\n```")
	if !strings.Contains(html, "<pre") {
		t.Errorf("expected <pre>, got: %s", html)
	}
	if !strings.Contains(html, "<code") {
		t.Errorf("expected <code>, got: %s", html)
	}
	// chroma should add class-based highlighting
	if !strings.Contains(html, "chroma") {
		t.Errorf("expected chroma class for syntax highlighting, got: %s", html)
	}
}

func TestRender_Table(t *testing.T) {
	md := "| A | B |\n|---|---|\n| 1 | 2 |"
	html := Render(md)
	if !strings.Contains(html, "<table") {
		t.Errorf("expected <table>, got: %s", html)
	}
}

func TestRender_MermaidNotHighlighted(t *testing.T) {
	html := Render("```mermaid\ngraph LR\n    A --> B\n```")
	// mermaid blocks should keep language-mermaid class for client-side rendering
	if !strings.Contains(html, "language-mermaid") {
		t.Errorf("expected language-mermaid class, got: %s", html)
	}
}

func TestRender_DataSourceLine(t *testing.T) {
	html := Render("# Title\n\nParagraph")
	if !strings.Contains(html, `data-source-line="1"`) {
		t.Errorf("expected data-source-line=1 on heading, got: %s", html)
	}
	if !strings.Contains(html, `data-source-line="3"`) {
		t.Errorf("expected data-source-line=3 on paragraph, got: %s", html)
	}
}

func TestRender_MathPassthrough(t *testing.T) {
	// KaTeX is client-side, so $...$ should pass through as-is
	html := Render("Inline $E=mc^2$ here")
	if !strings.Contains(html, "$E=mc^2$") {
		t.Errorf("expected math to pass through, got: %s", html)
	}
}

func TestRewriteImagePaths_Relative(t *testing.T) {
	input := `<img src="images/icon.png" alt="icon">`
	result := RewriteImagePaths(input, "/home/user/project")
	if !strings.Contains(result, "/_local/") {
		t.Errorf("expected /_local/ prefix, got: %s", result)
	}
	if strings.Contains(result, `src="images/`) {
		t.Errorf("relative path should be rewritten, got: %s", result)
	}
}

func TestRewriteImagePaths_ParentDir(t *testing.T) {
	input := `<img src="../docs/images/icon.png" alt="icon">`
	result := RewriteImagePaths(input, "/home/user/project/test")
	if !strings.Contains(result, "/_local/") {
		t.Errorf("expected /_local/ prefix, got: %s", result)
	}
}

func TestRewriteImagePaths_AbsoluteURL(t *testing.T) {
	tests := []struct {
		name string
		src  string
	}{
		{"https", `<img src="https://example.com/img.png">`},
		{"http", `<img src="http://example.com/img.png">`},
		{"data", `<img src="data:image/png;base64,abc">`},
		{"protocol-relative", `<img src="//example.com/img.png">`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := RewriteImagePaths(tt.src, "/home/user")
			if strings.Contains(result, "/_local/") {
				t.Errorf("absolute URL should not be rewritten, got: %s", result)
			}
		})
	}
}

func TestRewriteImagePaths_EmptyBaseDir(t *testing.T) {
	input := `<img src="icon.png">`
	result := RewriteImagePaths(input, "")
	if result != input {
		t.Errorf("empty baseDir should return input unchanged, got: %s", result)
	}
}
