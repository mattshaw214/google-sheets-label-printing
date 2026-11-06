//go:build darwin

package cups

import (
	"bytes"
	"os/exec"
)

type OSRunner struct{}

func (OSRunner) Output(name string, args ...string) ([]byte, error) {
	return exec.Command(name, args...).Output()
}

func (OSRunner) Run(name string, args []string, input []byte) error {
	command := exec.Command(name, args...)
	command.Stdin = bytes.NewReader(input)
	return command.Run()
}

func NewSpooler() Spooler {
	return Spooler{Runner: OSRunner{}}
}
