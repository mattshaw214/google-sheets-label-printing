package protocol

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"
)

const (
	MaxRequestBytes  = 64 * 1024 * 1024
	MaxResponseBytes = 1 * 1024 * 1024
)

var ErrFrameTooLarge = errors.New("native message frame exceeds size limit")

func ReadFrame(r io.Reader, limit int) ([]byte, error) {
	var header [4]byte
	if _, err := io.ReadFull(r, header[:]); err != nil {
		return nil, fmt.Errorf("read native message length: %w", err)
	}
	size := uint64(binary.LittleEndian.Uint32(header[:]))
	if size > uint64(limit) {
		return nil, fmt.Errorf("%w: %d bytes (limit %d)", ErrFrameTooLarge, size, limit)
	}
	payload := make([]byte, int(size))
	if _, err := io.ReadFull(r, payload); err != nil {
		if size > 0 && errors.Is(err, io.EOF) {
			err = io.ErrUnexpectedEOF
		}
		return nil, fmt.Errorf("read native message payload: %w", err)
	}
	return payload, nil
}

func WriteFrame(w io.Writer, payload []byte, limit int) error {
	if len(payload) > limit {
		return fmt.Errorf("%w: %d bytes (limit %d)", ErrFrameTooLarge, len(payload), limit)
	}
	var header [4]byte
	binary.LittleEndian.PutUint32(header[:], uint32(len(payload)))
	if err := writeAll(w, header[:]); err != nil {
		return fmt.Errorf("write native message length: %w", err)
	}
	if err := writeAll(w, payload); err != nil {
		return fmt.Errorf("write native message payload: %w", err)
	}
	return nil
}

func writeAll(w io.Writer, data []byte) error {
	for len(data) > 0 {
		n, err := w.Write(data)
		if n < 0 || n > len(data) {
			return fmt.Errorf("invalid write count %d", n)
		}
		data = data[n:]
		if err != nil {
			return err
		}
		if n == 0 {
			return io.ErrShortWrite
		}
	}
	return nil
}
