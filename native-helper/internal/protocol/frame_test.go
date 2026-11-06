package protocol

import (
	"bytes"
	"encoding/binary"
	"errors"
	"io"
	"strings"
	"testing"
)

func TestReadFrameUsesLittleEndianLength(t *testing.T) {
	wire := append([]byte{3, 0, 0, 0}, []byte("zpl")...)

	got, err := ReadFrame(bytes.NewReader(wire), MaxRequestBytes)
	if err != nil {
		t.Fatalf("ReadFrame() error = %v", err)
	}
	if string(got) != "zpl" {
		t.Fatalf("ReadFrame() = %q, want zpl", got)
	}
}

func TestReadFrameRejectsDeclaredLengthAboveLimitBeforePayloadRead(t *testing.T) {
	var header [4]byte
	binary.LittleEndian.PutUint32(header[:], uint32(MaxRequestBytes+1))

	_, err := ReadFrame(bytes.NewReader(header[:]), MaxRequestBytes)
	if !errors.Is(err, ErrFrameTooLarge) {
		t.Fatalf("ReadFrame() error = %v, want ErrFrameTooLarge", err)
	}
}

func TestReadFrameReportsTruncatedPayload(t *testing.T) {
	wire := append([]byte{4, 0, 0, 0}, []byte("zpl")...)

	_, err := ReadFrame(bytes.NewReader(wire), MaxRequestBytes)
	if !errors.Is(err, io.ErrUnexpectedEOF) {
		t.Fatalf("ReadFrame() error = %v, want io.ErrUnexpectedEOF", err)
	}
}

func TestWriteFrameUsesLittleEndianLength(t *testing.T) {
	var wire bytes.Buffer

	if err := WriteFrame(&wire, []byte("ok"), MaxResponseBytes); err != nil {
		t.Fatalf("WriteFrame() error = %v", err)
	}
	want := []byte{2, 0, 0, 0, 'o', 'k'}
	if !bytes.Equal(wire.Bytes(), want) {
		t.Fatalf("WriteFrame() = %v, want %v", wire.Bytes(), want)
	}
}

func TestWriteFrameRejectsPayloadAboveResponseLimit(t *testing.T) {
	err := WriteFrame(io.Discard, bytes.Repeat([]byte{'x'}, MaxResponseBytes+1), MaxResponseBytes)
	if !errors.Is(err, ErrFrameTooLarge) {
		t.Fatalf("WriteFrame() error = %v, want ErrFrameTooLarge", err)
	}
}

func TestWriteFrameCompletesShortWrites(t *testing.T) {
	w := &oneByteWriter{}

	if err := WriteFrame(w, []byte("ok"), MaxResponseBytes); err != nil {
		t.Fatalf("WriteFrame() error = %v", err)
	}
	if got, want := string(w.data), string([]byte{2, 0, 0, 0, 'o', 'k'}); got != want {
		t.Fatalf("wire = %v, want %v", []byte(got), []byte(want))
	}
}

func TestWriteFrameRejectsWriterWithoutProgress(t *testing.T) {
	err := WriteFrame(zeroWriter{}, []byte("ok"), MaxResponseBytes)
	if !errors.Is(err, io.ErrShortWrite) {
		t.Fatalf("WriteFrame() error = %v, want io.ErrShortWrite", err)
	}
}

type oneByteWriter struct {
	data []byte
}

func (w *oneByteWriter) Write(p []byte) (int, error) {
	if len(p) == 0 {
		return 0, nil
	}
	w.data = append(w.data, p[0])
	return 1, nil
}

type zeroWriter struct{}

func (zeroWriter) Write([]byte) (int, error) { return 0, nil }

func TestLimitsAreProtocolRequirements(t *testing.T) {
	if MaxRequestBytes != 64*1024*1024 {
		t.Fatalf("MaxRequestBytes = %d", MaxRequestBytes)
	}
	if MaxResponseBytes != 1024*1024 {
		t.Fatalf("MaxResponseBytes = %d", MaxResponseBytes)
	}
	if strings.TrimSpace(ErrFrameTooLarge.Error()) == "" {
		t.Fatal("ErrFrameTooLarge must be diagnostic")
	}
}
