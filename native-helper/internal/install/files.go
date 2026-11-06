package install

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

func writeFileAtomic(destination string, data []byte, mode os.FileMode) (resultErr error) {
	directory := filepath.Dir(destination)
	temporary, err := os.CreateTemp(directory, ".petes-garden-*")
	if err != nil {
		return fmt.Errorf("create temporary file for %s: %w", destination, err)
	}
	temporaryName := temporary.Name()
	closed := false
	defer func() {
		if !closed {
			if closeErr := temporary.Close(); closeErr != nil && resultErr == nil {
				resultErr = fmt.Errorf("close temporary file for %s: %w", destination, closeErr)
			}
		}
		if resultErr != nil {
			_ = os.Remove(temporaryName)
		}
	}()

	if err := temporary.Chmod(mode); err != nil {
		return fmt.Errorf("set permissions for %s: %w", destination, err)
	}
	if _, err := io.Copy(temporary, bytes.NewReader(data)); err != nil {
		return fmt.Errorf("write %s: %w", destination, err)
	}
	if err := temporary.Sync(); err != nil {
		return fmt.Errorf("sync %s: %w", destination, err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close %s: %w", destination, err)
	}
	closed = true
	if err := os.Rename(temporaryName, destination); err != nil {
		return fmt.Errorf("replace %s: %w", destination, err)
	}
	return nil
}
