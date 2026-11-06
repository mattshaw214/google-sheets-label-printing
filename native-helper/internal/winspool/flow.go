package winspool

import "fmt"

type spoolBackend interface {
	open(name string) (uintptr, error)
	startDoc(handle uintptr) error
	startPage(handle uintptr) error
	write(handle uintptr, raw []byte) (int, error)
	endPage(handle uintptr) error
	endDoc(handle uintptr) error
	close(handle uintptr) error
}

func printRaw(backend spoolBackend, name string, raw []byte) (err error) {
	handle, err := backend.open(name)
	if err != nil {
		return fmt.Errorf("OpenPrinterW: %w", err)
	}
	defer cleanup(&err, "ClosePrinter", func() error { return backend.close(handle) })

	if err = backend.startDoc(handle); err != nil {
		return fmt.Errorf("StartDocPrinterW: %w", err)
	}
	defer cleanup(&err, "EndDocPrinter", func() error { return backend.endDoc(handle) })

	if err = backend.startPage(handle); err != nil {
		return fmt.Errorf("StartPagePrinter: %w", err)
	}
	defer cleanup(&err, "EndPagePrinter", func() error { return backend.endPage(handle) })

	written, writeErr := backend.write(handle, raw)
	if writeErr != nil {
		return fmt.Errorf("WritePrinter: %w", writeErr)
	}
	if written != len(raw) {
		return fmt.Errorf("WritePrinter wrote %d of %d bytes", written, len(raw))
	}
	return nil
}

func cleanup(result *error, operation string, action func() error) {
	if err := action(); err != nil && *result == nil {
		*result = fmt.Errorf("%s: %w", operation, err)
	}
}
