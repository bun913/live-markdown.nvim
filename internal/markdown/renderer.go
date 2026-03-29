package markdown

import (
	"bytes"
	"net/url"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	chromahtml "github.com/alecthomas/chroma/v2/formatters/html"
	"github.com/yuin/goldmark"
	highlighting "github.com/yuin/goldmark-highlighting/v2"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/renderer/html"
	"github.com/yuin/goldmark/text"
	"github.com/yuin/goldmark/util"
)

var md goldmark.Markdown

func init() {
	md = goldmark.New(
		goldmark.WithExtensions(
			extension.GFM,
			highlighting.NewHighlighting(
				highlighting.WithStyle("github"),
				highlighting.WithFormatOptions(
					chromahtml.WithClasses(true),
				),
			),
		),
		goldmark.WithParserOptions(
			parser.WithAutoHeadingID(),
			parser.WithASTTransformers(
				util.Prioritized(&sourceLineTransformer{}, 100),
			),
		),
		goldmark.WithRendererOptions(
			html.WithUnsafe(),
		),
	)
}

// Render converts markdown text to HTML.
func Render(source string) string {
	src := []byte(source)
	var buf bytes.Buffer
	if err := md.Convert(src, &buf); err != nil {
		return "<p>Render error: " + err.Error() + "</p>"
	}
	return buf.String()
}

// RewriteImagePaths rewrites relative image src attributes to /_local/<absolute-path>.
func RewriteImagePaths(html, baseDir string) string {
	if baseDir == "" {
		return html
	}
	return imgSrcRe.ReplaceAllStringFunc(html, func(match string) string {
		groups := imgSrcRe.FindStringSubmatch(match)
		if len(groups) < 4 {
			return match
		}
		src := groups[2]
		if isAbsoluteURL(src) {
			return match
		}
		abs := filepath.Join(baseDir, src)
		abs, _ = filepath.Abs(abs)
		return groups[1] + "/_local/" + url.PathEscape(abs) + groups[3]
	})
}

var imgSrcRe = regexp.MustCompile(`(<img\s[^>]*src=")([^"]+)(")`)

func isAbsoluteURL(s string) bool {
	return strings.HasPrefix(s, "http://") ||
		strings.HasPrefix(s, "https://") ||
		strings.HasPrefix(s, "data:") ||
		strings.HasPrefix(s, "//")
}

// sourceLineTransformer injects data-source-line attributes on block elements.
type sourceLineTransformer struct{}

func (t *sourceLineTransformer) Transform(node *ast.Document, reader text.Reader, pc parser.Context) {
	source := reader.Source()
	ast.Walk(node, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			return ast.WalkContinue, nil
		}
		if !isTargetBlock(n) {
			return ast.WalkContinue, nil
		}
		if n.Lines().Len() > 0 {
			line := n.Lines().At(0)
			lineNum := bytes.Count(source[:line.Start], []byte("\n")) + 1
			n.SetAttributeString("data-source-line", []byte(strconv.Itoa(lineNum)))
		} else if n.HasChildren() {
			// For container blocks (lists, blockquotes), use first child's line
			first := n.FirstChild()
			if first != nil && first.Lines().Len() > 0 {
				line := first.Lines().At(0)
				lineNum := bytes.Count(source[:line.Start], []byte("\n")) + 1
				n.SetAttributeString("data-source-line", []byte(strconv.Itoa(lineNum)))
			}
		}
		return ast.WalkContinue, nil
	})
}

func isTargetBlock(n ast.Node) bool {
	switch n.Kind() {
	case ast.KindHeading,
		ast.KindParagraph,
		ast.KindList,
		ast.KindBlockquote,
		ast.KindCodeBlock,
		ast.KindFencedCodeBlock,
		ast.KindThematicBreak:
		return true
	}
	// GFM Table
	if n.Kind().String() == "Table" {
		return true
	}
	return false
}
