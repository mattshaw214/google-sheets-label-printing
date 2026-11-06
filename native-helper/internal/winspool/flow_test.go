package winspool

import (
	"errors"
	"reflect"
	"strings"
	"testing"
)

func TestPrintRawWritesExactBytesAndCleansUpInReverse(t *testing.T) {
	backend := &fakeBackend{}
	raw := []byte("^XA\r\n^XZ")

	if err := printRaw(backend, "Zebra", raw); err != nil {
		t.Fatalf("printRaw() error = %v", err)
	}
	wantCalls := []string{"open:Zebra", "startDoc", "startPage", "write", "endPage", "endDoc", "close"}
	if !reflect.DeepEqual(backend.calls, wantCalls) {
		t.Fatalf("calls = %#v, want %#v", backend.calls, wantCalls)
	}
	if !reflect.DeepEqual(backend.raw, raw) {
		t.Fatalf("written = %q, want %q", backend.raw, raw)
	}
}

func TestPrintRawCleansStartedOperationsAfterWriteFailure(t *testing.T) {
	backend := &fakeBackend{failAt: "write"}

	err := printRaw(backend, "Zebra", []byte("^XA^XZ"))
	if err == nil || !strings.Contains(err.Error(), "WritePrinter") {
		t.Fatalf("printRaw() error = %v", err)
	}
	wantCalls := []string{"open:Zebra", "startDoc", "startPage", "write", "endPage", "endDoc", "close"}
	if !reflect.DeepEqual(backend.calls, wantCalls) {
		t.Fatalf("calls = %#v, want %#v", backend.calls, wantCalls)
	}
}

func TestPrintRawOnlyCleansSuccessfullyStartedOperations(t *testing.T) {
	backend := &fakeBackend{failAt: "startPage"}

	_ = printRaw(backend, "Zebra", []byte("^XA^XZ"))
	wantCalls := []string{"open:Zebra", "startDoc", "startPage", "endDoc", "close"}
	if !reflect.DeepEqual(backend.calls, wantCalls) {
		t.Fatalf("calls = %#v, want %#v", backend.calls, wantCalls)
	}
}

func TestPrintRawRejectsPartialSuccessfulWrite(t *testing.T) {
	backend := &fakeBackend{partialWrite: true}

	err := printRaw(backend, "Zebra", []byte("^XA^XZ"))
	if err == nil || !strings.Contains(err.Error(), "wrote") {
		t.Fatalf("printRaw() error = %v, want partial-write error", err)
	}
}

func TestPrintRawReportsCleanupErrorWhenOperationOtherwiseSucceeds(t *testing.T) {
	backend := &fakeBackend{failAt: "endDoc"}

	err := printRaw(backend, "Zebra", []byte("^XA^XZ"))
	if err == nil || !strings.Contains(err.Error(), "EndDocPrinter") {
		t.Fatalf("printRaw() error = %v", err)
	}
}

type fakeBackend struct {
	calls        []string
	raw          []byte
	failAt       string
	partialWrite bool
}

func (b *fakeBackend) open(name string) (uintptr, error) {
	b.calls = append(b.calls, "open:"+name)
	return 1, b.failure("open")
}
func (b *fakeBackend) startDoc(uintptr) error {
	b.calls = append(b.calls, "startDoc")
	return b.failure("startDoc")
}
func (b *fakeBackend) startPage(uintptr) error {
	b.calls = append(b.calls, "startPage")
	return b.failure("startPage")
}
func (b *fakeBackend) write(_ uintptr, raw []byte) (int, error) {
	b.calls = append(b.calls, "write")
	b.raw = append([]byte(nil), raw...)
	if b.partialWrite {
		return len(raw) - 1, nil
	}
	return len(raw), b.failure("write")
}
func (b *fakeBackend) endPage(uintptr) error {
	b.calls = append(b.calls, "endPage")
	return b.failure("endPage")
}
func (b *fakeBackend) endDoc(uintptr) error {
	b.calls = append(b.calls, "endDoc")
	return b.failure("endDoc")
}
func (b *fakeBackend) close(uintptr) error {
	b.calls = append(b.calls, "close")
	return b.failure("close")
}
func (b *fakeBackend) failure(operation string) error {
	if b.failAt == operation {
		return errors.New("windows failure")
	}
	return nil
}
