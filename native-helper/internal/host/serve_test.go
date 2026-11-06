package host

import (
	"bytes"
	"encoding/json"
	"testing"

	"petesgarden/windowshelper/internal/protocol"
)

func TestServeHandlesMultipleFramedRequestsUntilEOF(t *testing.T) {
	var input bytes.Buffer
	if err := protocol.WriteFrame(&input, []byte(`{"command":"status"}`), protocol.MaxRequestBytes); err != nil {
		t.Fatal(err)
	}
	if err := protocol.WriteFrame(&input, []byte(`{"command":"list_printers"}`), protocol.MaxRequestBytes); err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer

	if err := Serve(&input, &output, &fakePrinter{printers: []string{"Zebra"}}); err != nil {
		t.Fatalf("Serve() error = %v", err)
	}

	first := readResponse(t, &output)
	second := readResponse(t, &output)
	if !first.OK || !second.OK || len(second.Printers) != 1 || second.Printers[0] != "Zebra" {
		t.Fatalf("responses = %+v, %+v", first, second)
	}
	if output.Len() != 0 {
		t.Fatalf("Serve() left %d response bytes", output.Len())
	}
}

func TestServeReturnsFrameErrors(t *testing.T) {
	input := bytes.NewReader([]byte{0, 0, 0, 4})
	err := Serve(input, &bytes.Buffer{}, &fakePrinter{})
	if err == nil {
		t.Fatal("Serve() error = nil, want oversized-frame error")
	}
}

func readResponse(t *testing.T, input *bytes.Buffer) Response {
	t.Helper()
	payload, err := protocol.ReadFrame(input, protocol.MaxResponseBytes)
	if err != nil {
		t.Fatalf("read response: %v", err)
	}
	var response struct {
		OK       bool     `json:"ok"`
		Error    string   `json:"error"`
		Printers []string `json:"printers"`
	}
	if err := json.Unmarshal(payload, &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return Response{OK: response.OK, Error: response.Error, Printers: response.Printers}
}
