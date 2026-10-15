// Genera el icono de macOS (1024×1024 con el margen estándar) a partir del logo:
// swift make-icon.swift logo.png salida.png
import AppKit

let args = CommandLine.arguments
let input = args.count > 1 ? args[1] : "logo.png"
let out = args.count > 2 ? args[2] : "icon-1024.png"
guard let logo = NSImage(contentsOfFile: input) else { fatalError("No se pudo leer \(input)") }
let size = 1024.0, content = 824.0
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size), bitsPerSample: 8,
                           samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
let ctx = NSGraphicsContext(bitmapImageRep: rep)!
ctx.imageInterpolation = .high
NSGraphicsContext.current = ctx
let o = (size - content) / 2
// sombra suave como los iconos de macOS
let shadow = NSShadow()
shadow.shadowColor = NSColor.black.withAlphaComponent(0.28)
shadow.shadowBlurRadius = 18
shadow.shadowOffset = NSSize(width: 0, height: -8)
shadow.set()
logo.draw(in: NSRect(x: o, y: o, width: content, height: content), from: .zero, operation: .sourceOver, fraction: 1)
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
print("icono:", out)
