package host

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"

	"petesgarden/windowshelper/internal/protocol"
)

func Serve(input io.Reader, output io.Writer, printer Printer) error {
	for {
		payload, err := protocol.ReadFrame(input, protocol.MaxRequestBytes)
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return err
		}
		response, err := json.Marshal(HandleJSON(payload, printer))
		if err != nil {
			return fmt.Errorf("encode native response: %w", err)
		}
		if err := protocol.WriteFrame(output, response, protocol.MaxResponseBytes); err != nil {
			return err
		}
	}
}
