package host

import (
	"bytes"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestHandleStatus(t *testing.T) {
	response := HandleJSON([]byte(`{"command":"status"}`), &fakePrinter{})

	if !response.OK || response.Error != "" {
		t.Fatalf("HandleJSON(status) = %+v", response)
	}
}

func TestHandleListPrintersReturnsQueues(t *testing.T) {
	printer := &fakePrinter{printers: []string{"Zebra ZD421", "Office"}}

	response := HandleJSON([]byte(`{"command":"list_printers"}`), printer)

	if !response.OK || len(response.Printers) != 2 || response.Printers[0] != "Zebra ZD421" {
		t.Fatalf("HandleJSON(list_printers) = %+v", response)
	}
}

func TestHandleListPrintersReturnsEmptyArray(t *testing.T) {
	response := HandleJSON([]byte(`{"command":"list_printers"}`), &fakePrinter{})

	encoded, err := json.Marshal(response)
	if err != nil {
		t.Fatal(err)
	}
	if got, want := string(encoded), `{"ok":true,"printers":[]}`; got != want {
		t.Fatalf("response JSON = %s, want %s", got, want)
	}
}

func TestHandlePrintRawSendsExactASCIIBytes(t *testing.T) {
	printer := &fakePrinter{}
	raw := "^XA\n^FO10,10^FDGarden^FS\n^XZ"
	payload, _ := json.Marshal(map[string]string{
		"command":     "print_raw",
		"printerName": "Zebra ZD421",
		"raw":         raw,
	})

	response := HandleJSON(payload, printer)

	if !response.OK {
		t.Fatalf("HandleJSON(print_raw) = %+v", response)
	}
	if printer.printedName != "Zebra ZD421" || !bytes.Equal(printer.printedRaw, []byte(raw)) {
		t.Fatalf("PrintRaw(%q, %q)", printer.printedName, printer.printedRaw)
	}
}

func TestHandleRejectsNonStrictJSON(t *testing.T) {
	tests := map[string]string{
		"unknown field":    `{"command":"status","extra":true}`,
		"wrong field case": `{"Command":"status"}`,
		"duplicate field":  `{"command":"status","command":"list_printers"}`,
		"trailing JSON":    `{"command":"status"}{"command":"status"}`,
		"wrong type":       `{"command":17}`,
		"null command":     `{"command":null}`,
		"null optional":    `{"command":"status","printerName":null}`,
		"missing command":  `{"printerName":"Zebra"}`,
		"null":             `null`,
		"array":            `[]`,
	}
	for name, payload := range tests {
		t.Run(name, func(t *testing.T) {
			response := HandleJSON([]byte(payload), &fakePrinter{})
			if response.OK || !strings.Contains(response.Error, "invalid request") {
				t.Fatalf("HandleJSON(%s) = %+v", payload, response)
			}
		})
	}
}

func TestHandleRejectsUnsupportedCommand(t *testing.T) {
	response := HandleJSON([]byte(`{"command":"erase_everything"}`), &fakePrinter{})
	if response.OK || !strings.Contains(response.Error, "unsupported command") {
		t.Fatalf("HandleJSON() = %+v", response)
	}
}

func TestHandleRejectsInvalidUTF8JSON(t *testing.T) {
	payload := append([]byte(`{"command":"sta`), 0xff)
	payload = append(payload, []byte(`tus"}`)...)

	response := HandleJSON(payload, &fakePrinter{})
	if response.OK || !strings.Contains(response.Error, "invalid request") {
		t.Fatalf("HandleJSON(invalid UTF-8) = %+v", response)
	}
}

func TestHandlePrintRawRequiresQueueAndRawField(t *testing.T) {
	tests := map[string]string{
		"missing queue":    `{"command":"print_raw","raw":"^XA^XZ"}`,
		"blank queue":      `{"command":"print_raw","printerName":"   ","raw":"^XA^XZ"}`,
		"missing raw":      `{"command":"print_raw","printerName":"Zebra"}`,
		"non ASCII":        `{"command":"print_raw","printerName":"Zebra","raw":"café"}`,
		"unsupported byte": "{\"command\":\"print_raw\",\"printerName\":\"Zebra\",\"raw\":\"\\u0080\"}",
	}
	for name, payload := range tests {
		t.Run(name, func(t *testing.T) {
			response := HandleJSON([]byte(payload), &fakePrinter{})
			if response.OK || response.Error == "" {
				t.Fatalf("HandleJSON(%s) = %+v", payload, response)
			}
		})
	}
}

func TestHandlePrintRawRejectsPayloadAboveRawLimit(t *testing.T) {
	raw := strings.Repeat("A", MaxRawBytes+1)
	payload, err := json.Marshal(map[string]string{"command": "print_raw", "printerName": "Zebra", "raw": raw})
	if err != nil {
		t.Fatal(err)
	}

	response := HandleJSON(payload, &fakePrinter{})
	if response.OK || !strings.Contains(response.Error, "too large") {
		t.Fatalf("HandleJSON(oversized raw) = %+v", response)
	}
}

func TestHandleReportsPrinterErrors(t *testing.T) {
	printer := &fakePrinter{listErr: errors.New("enum failed"), printErr: errors.New("write failed")}
	if response := HandleJSON([]byte(`{"command":"list_printers"}`), printer); response.OK || !strings.Contains(response.Error, "enum failed") {
		t.Fatalf("list response = %+v", response)
	}
	if response := HandleJSON([]byte(`{"command":"print_raw","printerName":"Zebra","raw":"^XA^XZ"}`), printer); response.OK || !strings.Contains(response.Error, "write failed") {
		t.Fatalf("print response = %+v", response)
	}
}

type fakePrinter struct {
	printers    []string
	listErr     error
	printedName string
	printedRaw  []byte
	printErr    error
}

func (p *fakePrinter) ListPrinters() ([]string, error) {
	return p.printers, p.listErr
}

func (p *fakePrinter) PrintRaw(name string, raw []byte) error {
	p.printedName = name
	p.printedRaw = append([]byte(nil), raw...)
	return p.printErr
}
