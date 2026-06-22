package static

import (
	"embed"
	"io/fs"
)

//go:embed *
var embeddedFiles embed.FS

// GetStaticFS returns the embedded static files as a filesystem
func GetStaticFS() fs.FS {
	return embeddedFiles
}
