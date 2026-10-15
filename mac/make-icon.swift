// Genera el icono de "Notas de L" (PNG 1024x1024): swift make-icon.swift salida.png
import AppKit

let size = 1024.0
let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "icon.png"
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size), bitsPerSample: 8,
                           samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)

// Fondo tipo "squircle" de macOS con degradado
let inset = 100.0
let rect = NSRect(x: inset, y: inset, width: size - inset * 2, height: size - inset * 2)
let bg = NSBezierPath(roundedRect: rect, xRadius: 185, yRadius: 185)
NSGradient(colors: [NSColor(red: 0.40, green: 0.49, blue: 0.92, alpha: 1), NSColor(red: 0.46, green: 0.29, blue: 0.64, alpha: 1)])!
    .draw(in: bg, angle: -60)

// Hoja de papel
let paper = NSRect(x: 300, y: 250, width: 424, height: 524)
let shadow = NSShadow()
shadow.shadowColor = NSColor.black.withAlphaComponent(0.25)
shadow.shadowBlurRadius = 30
shadow.shadowOffset = NSSize(width: 0, height: -12)
shadow.set()
NSColor.white.setFill()
NSBezierPath(roundedRect: paper, xRadius: 36, yRadius: 36).fill()
NSShadow().set()

// Líneas de texto
NSColor(white: 0.85, alpha: 1).setFill()
for (i, w) in [250.0, 300.0, 220.0].enumerated() {
    NSBezierPath(roundedRect: NSRect(x: 360, y: 330 + Double(i) * 56, width: w, height: 22), xRadius: 11, yRadius: 11).fill()
}

// Letra "L"
let font = NSFont.systemFont(ofSize: 300, weight: .heavy)
let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: NSColor(red: 0.21, green: 0.21, blue: 0.18, alpha: 1)]
let l = NSAttributedString(string: "L", attributes: attrs)
let ls = l.size()
l.draw(at: NSPoint(x: paper.midX - ls.width / 2 - 40, y: 470))

NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
print("icono:", out)
