package cups

import (
	"bytes"
	"reflect"
	"strings"
	"testing"
)

type fakeRunner struct {
	output              []byte
	outputName, runName string
	outputArgs, runArgs []string
	runInput            []byte
	outputErr, runErr   error
}

func (f *fakeRunner) Output(name string, args ...string) ([]byte, error) {
	f.outputName = name
	f.outputArgs = append([]string(nil), args...)
	return append([]byte(nil), f.output...), f.outputErr
}

func (f *fakeRunner) Run(name string, args []string, input []byte) error {
	f.runName = name
	f.runArgs = append([]string(nil), args...)
	f.runInput = append([]byte(nil), input...)
	return f.runErr
}

func TestListPrintersParsesCUPSQueues(t *testing.T) {
	runner := &fakeRunner{output: []byte(
		"printer Brother_HL_L3300CDW_series is idle.\n" +
			"printer Petes_Garden_ZD220_USB is idle.\n",
	)}
	spooler := Spooler{Runner: runner}
	got, err := spooler.ListPrinters()
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"Brother_HL_L3300CDW_series", "Petes_Garden_ZD220_USB"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %#v, want %#v", got, want)
	}
	if runner.outputName != "/usr/bin/lpstat" ||
		!reflect.DeepEqual(runner.outputArgs, []string{"-p"}) {
		t.Fatalf("unexpected discovery command: %s %#v", runner.outputName, runner.outputArgs)
	}
}

func TestPrintRawUsesExactValidatedQueueAndStdin(t *testing.T) {
	runner := &fakeRunner{output: []byte("printer Petes_Garden_ZD220_USB is idle.\n")}
	spooler := Spooler{Runner: runner}
	raw := []byte("^XA^XZ\r\n")
	if err := spooler.PrintRaw("Petes_Garden_ZD220_USB", raw); err != nil {
		t.Fatal(err)
	}
	if runner.runName != "/usr/bin/lp" {
		t.Fatalf("unexpected executable %q", runner.runName)
	}
	wantArgs := []string{"-d", "Petes_Garden_ZD220_USB", "-o", "raw"}
	if !reflect.DeepEqual(runner.runArgs, wantArgs) {
		t.Fatalf("got args %#v, want %#v", runner.runArgs, wantArgs)
	}
	if !bytes.Equal(runner.runInput, raw) {
		t.Fatalf("raw stdin changed")
	}
}

func TestPrintRawRejectsQueueNotReturnedByCUPS(t *testing.T) {
	runner := &fakeRunner{output: []byte("printer Petes_Garden_ZD220_USB is idle.\n")}
	err := (Spooler{Runner: runner}).PrintRaw("Injected; rm -rf", []byte("^XA^XZ"))
	if err == nil || !strings.Contains(err.Error(), "is not an installed printer queue") {
		t.Fatalf("unexpected error: %v", err)
	}
	if runner.runName != "" {
		t.Fatal("lp must not run for an unknown queue")
	}
}
