package host

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"unicode/utf8"
)

const MaxRawBytes = 16 * 1024 * 1024

type Printer interface {
	ListPrinters() ([]string, error)
	PrintRaw(name string, raw []byte) error
}

type Request struct {
	Command     string  `json:"command"`
	PrinterName string  `json:"printerName,omitempty"`
	Raw         *string `json:"raw,omitempty"`
}

type Response struct {
	OK       bool     `json:"ok"`
	Error    string   `json:"error,omitempty"`
	Printers []string `json:"-"`
}

func (response Response) MarshalJSON() ([]byte, error) {
	type responseJSON struct {
		OK       bool      `json:"ok"`
		Error    string    `json:"error,omitempty"`
		Printers *[]string `json:"printers,omitempty"`
	}
	var printers *[]string
	if response.Printers != nil {
		printers = &response.Printers
	}
	return json.Marshal(responseJSON{OK: response.OK, Error: response.Error, Printers: printers})
}

func HandleJSON(payload []byte, printer Printer) Response {
	request, err := decodeRequest(payload)
	if err != nil {
		return failure("invalid request: %v", err)
	}

	switch request.Command {
	case "status":
		return Response{OK: true}
	case "list_printers":
		printers, err := printer.ListPrinters()
		if err != nil {
			return failure("list printers: %v", err)
		}
		if printers == nil {
			printers = []string{}
		}
		return Response{OK: true, Printers: printers}
	case "print_raw":
		if strings.TrimSpace(request.PrinterName) == "" {
			return failure("printerName is required")
		}
		if request.Raw == nil {
			return failure("raw is required")
		}
		if len(*request.Raw) > MaxRawBytes {
			return failure("raw payload is too large: %d bytes (limit %d)", len(*request.Raw), MaxRawBytes)
		}
		if !isASCII(*request.Raw) {
			return failure("raw payload must contain ASCII bytes only")
		}
		if err := printer.PrintRaw(request.PrinterName, []byte(*request.Raw)); err != nil {
			return failure("print raw: %v", err)
		}
		return Response{OK: true}
	default:
		return failure("unsupported command %q", request.Command)
	}
}

func decodeRequest(payload []byte) (*Request, error) {
	if !utf8.Valid(payload) {
		return nil, fmt.Errorf("request is not valid UTF-8")
	}
	if err := rejectDuplicateFields(payload); err != nil {
		return nil, err
	}
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	var request *Request
	if err := decoder.Decode(&request); err != nil {
		return nil, err
	}
	if request == nil {
		return nil, fmt.Errorf("request must be a JSON object")
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return nil, fmt.Errorf("request contains trailing JSON value")
		}
		return nil, fmt.Errorf("request contains trailing data: %w", err)
	}
	return request, nil
}

func rejectDuplicateFields(payload []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(payload))
	first, err := decoder.Token()
	if err != nil {
		return nil
	}
	objectStart, isDelimiter := first.(json.Delim)
	if !isDelimiter || objectStart != '{' {
		return nil
	}
	seen := make(map[string]struct{})
	for decoder.More() {
		keyToken, err := decoder.Token()
		if err != nil {
			return nil
		}
		key, ok := keyToken.(string)
		if !ok {
			return nil
		}
		if _, exists := seen[key]; exists {
			return fmt.Errorf("duplicate field %q", key)
		}
		switch key {
		case "command", "printerName", "raw":
		default:
			return fmt.Errorf("unknown field %q", key)
		}
		seen[key] = struct{}{}
		var value json.RawMessage
		if err := decoder.Decode(&value); err != nil {
			return nil
		}
		var stringValue *string
		if err := json.Unmarshal(value, &stringValue); err != nil || stringValue == nil {
			return fmt.Errorf("field %q must be a JSON string", key)
		}
	}
	if _, exists := seen["command"]; !exists {
		return fmt.Errorf("field %q is required", "command")
	}
	return nil
}

func isASCII(value string) bool {
	for index := 0; index < len(value); index++ {
		if value[index] > 0x7f {
			return false
		}
	}
	return true
}

func failure(format string, args ...any) Response {
	return Response{OK: false, Error: fmt.Sprintf(format, args...)}
}
