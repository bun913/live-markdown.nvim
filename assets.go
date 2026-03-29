package livemarkdown

import "embed"

//go:embed client/*
var ClientFS embed.FS

//go:embed static/css/* static/fonts/* static/js/katex.min.js static/js/mermaid.min.js static/js/contrib/auto-render.min.js
var StaticFS embed.FS
