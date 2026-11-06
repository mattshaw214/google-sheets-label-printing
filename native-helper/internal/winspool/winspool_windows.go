//go:build windows

package winspool

import (
	"fmt"
	"runtime"
	"syscall"
	"unsafe"
)

const (
	printerEnumLocal        = 0x00000002
	printerEnumConnections  = 0x00000004
	errorInsufficientBuffer = syscall.Errno(122)
)

var (
	winspoolDLL          = syscall.NewLazyDLL("winspool.drv")
	procEnumPrintersW    = winspoolDLL.NewProc("EnumPrintersW")
	procOpenPrinterW     = winspoolDLL.NewProc("OpenPrinterW")
	procStartDocPrinterW = winspoolDLL.NewProc("StartDocPrinterW")
	procStartPagePrinter = winspoolDLL.NewProc("StartPagePrinter")
	procWritePrinter     = winspoolDLL.NewProc("WritePrinter")
	procEndPagePrinter   = winspoolDLL.NewProc("EndPagePrinter")
	procEndDocPrinter    = winspoolDLL.NewProc("EndDocPrinter")
	procClosePrinter     = winspoolDLL.NewProc("ClosePrinter")
)

type Spooler struct{}

func (Spooler) ListPrinters() ([]string, error) {
	var needed uint32
	var returned uint32
	flags := uintptr(printerEnumLocal | printerEnumConnections)
	result, _, callErr := procEnumPrintersW.Call(
		flags,
		0,
		4,
		0,
		0,
		uintptr(unsafe.Pointer(&needed)),
		uintptr(unsafe.Pointer(&returned)),
	)
	if result != 0 && needed == 0 {
		return []string{}, nil
	}
	if result == 0 && !isWindowsErrno(callErr, errorInsufficientBuffer) {
		return nil, win32Error("EnumPrintersW(size)", callErr)
	}
	if needed == 0 {
		return []string{}, nil
	}

	buffer := make([]byte, needed)
	result, _, callErr = procEnumPrintersW.Call(
		flags,
		0,
		4,
		uintptr(unsafe.Pointer(&buffer[0])),
		uintptr(needed),
		uintptr(unsafe.Pointer(&needed)),
		uintptr(unsafe.Pointer(&returned)),
	)
	if result == 0 {
		return nil, win32Error("EnumPrintersW(data)", callErr)
	}

	entrySize := unsafe.Sizeof(printerInfo4{})
	if uint64(returned)*uint64(entrySize) > uint64(len(buffer)) {
		return nil, fmt.Errorf("EnumPrintersW returned %d entries outside %d-byte buffer", returned, len(buffer))
	}
	names := make([]string, 0, returned)
	for index := uintptr(0); index < uintptr(returned); index++ {
		entry := (*printerInfo4)(unsafe.Add(unsafe.Pointer(&buffer[0]), index*entrySize))
		names = append(names, utf16PointerToString(entry.printerName))
	}
	runtime.KeepAlive(buffer)
	return NormalizePrinterNames(names), nil
}

func (Spooler) PrintRaw(name string, raw []byte) error {
	return printRaw(win32Backend{}, name, raw)
}

type printerInfo4 struct {
	printerName *uint16
	serverName  *uint16
	attributes  uint32
}

type docInfo1 struct {
	docName    *uint16
	outputFile *uint16
	datatype   *uint16
}

type win32Backend struct{}

func (win32Backend) open(name string) (uintptr, error) {
	namePointer, err := syscall.UTF16PtrFromString(name)
	if err != nil {
		return 0, fmt.Errorf("invalid printer name: %w", err)
	}
	var handle syscall.Handle
	result, _, callErr := procOpenPrinterW.Call(
		uintptr(unsafe.Pointer(namePointer)),
		uintptr(unsafe.Pointer(&handle)),
		0,
	)
	runtime.KeepAlive(namePointer)
	if result == 0 {
		return 0, win32Error("OpenPrinterW", callErr)
	}
	return uintptr(handle), nil
}

func (win32Backend) startDoc(handle uintptr) error {
	docName, err := syscall.UTF16PtrFromString("Pete's Garden Zebra Label")
	if err != nil {
		return err
	}
	datatype, err := syscall.UTF16PtrFromString("RAW")
	if err != nil {
		return err
	}
	document := docInfo1{docName: docName, datatype: datatype}
	jobID, _, callErr := procStartDocPrinterW.Call(handle, 1, uintptr(unsafe.Pointer(&document)))
	runtime.KeepAlive(document)
	if jobID == 0 {
		return win32Error("StartDocPrinterW", callErr)
	}
	return nil
}

func (win32Backend) startPage(handle uintptr) error {
	result, _, callErr := procStartPagePrinter.Call(handle)
	if result == 0 {
		return win32Error("StartPagePrinter", callErr)
	}
	return nil
}

func (win32Backend) write(handle uintptr, raw []byte) (int, error) {
	var dataPointer uintptr
	if len(raw) > 0 {
		dataPointer = uintptr(unsafe.Pointer(&raw[0]))
	}
	var written uint32
	result, _, callErr := procWritePrinter.Call(
		handle,
		dataPointer,
		uintptr(uint32(len(raw))),
		uintptr(unsafe.Pointer(&written)),
	)
	runtime.KeepAlive(raw)
	if result == 0 {
		return int(written), win32Error("WritePrinter", callErr)
	}
	return int(written), nil
}

func (win32Backend) endPage(handle uintptr) error {
	result, _, callErr := procEndPagePrinter.Call(handle)
	if result == 0 {
		return win32Error("EndPagePrinter", callErr)
	}
	return nil
}

func (win32Backend) endDoc(handle uintptr) error {
	result, _, callErr := procEndDocPrinter.Call(handle)
	if result == 0 {
		return win32Error("EndDocPrinter", callErr)
	}
	return nil
}

func (win32Backend) close(handle uintptr) error {
	result, _, callErr := procClosePrinter.Call(handle)
	if result == 0 {
		return win32Error("ClosePrinter", callErr)
	}
	return nil
}

func utf16PointerToString(pointer *uint16) string {
	if pointer == nil {
		return ""
	}
	length := 0
	for *(*uint16)(unsafe.Add(unsafe.Pointer(pointer), uintptr(length)*unsafe.Sizeof(uint16(0)))) != 0 {
		length++
	}
	return syscall.UTF16ToString(unsafe.Slice(pointer, length))
}

func win32Error(operation string, callErr error) error {
	if errno, ok := callErr.(syscall.Errno); ok && errno != 0 {
		return fmt.Errorf("%s failed: %w", operation, errno)
	}
	return fmt.Errorf("%s failed without a Windows error code", operation)
}

func isWindowsErrno(err error, want syscall.Errno) bool {
	errno, ok := err.(syscall.Errno)
	return ok && errno == want
}
