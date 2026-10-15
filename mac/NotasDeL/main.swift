// Notas de L — app de escritorio para macOS.
// Muestra la app web empaquetada en un WKWebView servido desde el esquema propio notasdel://
// e implementa el inicio de sesión con Google de forma nativa (ASWebAuthenticationSession + PKCE),
// guardando el refresh token en el Llavero de macOS.
import AppKit
import AuthenticationServices
import CryptoKit
import Security
import WebKit

let appName = "Notas de L"
let scheme = "notasdel"
let keychainService = "com.la86926.notasdel.google"

// MARK: - Servidor de archivos interno (notasdel://app/…)

final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    let root: URL
    init(root: URL) { self.root = root.standardizedFileURL }

    static let mime: [String: String] = [
        "html": "text/html", "js": "text/javascript", "css": "text/css", "json": "application/json",
        "png": "image/png", "svg": "image/svg+xml", "ico": "image/x-icon", "woff2": "font/woff2", "md": "text/markdown",
    ]

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return task.didFailWithError(URLError(.badURL)) }
        var path = url.path.removingPercentEncoding ?? url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        let file = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
        // Evita salir de la carpeta web (path traversal)
        guard file.path.hasPrefix(root.path + "/"), let data = try? Data(contentsOf: file) else {
            let resp = HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: nil)!
            task.didReceive(resp)
            task.didReceive(Data("No encontrado".utf8))
            return task.didFinish()
        }
        let type = BundleSchemeHandler.mime[file.pathExtension.lowercased()] ?? "application/octet-stream"
        let resp = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1",
                                   headerFields: ["Content-Type": type + (type.hasPrefix("text") ? "; charset=utf-8" : ""),
                                                  "Content-Length": "\(data.count)", "Cache-Control": "no-cache"])!
        task.didReceive(resp)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

// MARK: - Llavero

enum Keychain {
    static func save(_ value: String) {
        delete()
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: keychainService,
                                kSecAttrAccount as String: "refresh_token", kSecValueData as String: Data(value.utf8),
                                kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        SecItemAdd(q as CFDictionary, nil)
    }
    static func load() -> String? {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: keychainService,
                                kSecAttrAccount as String: "refresh_token", kSecReturnData as String: true,
                                kSecMatchLimit as String: kSecMatchLimitOne]
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data else { return nil }
        return String(data: d, encoding: .utf8)
    }
    static func delete() {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: keychainService]
        SecItemDelete(q as CFDictionary)
    }
}

// MARK: - Google OAuth nativo (PKCE)

final class GoogleAuth: NSObject, ASWebAuthenticationPresentationContextProviding {
    weak var window: NSWindow?
    var session: ASWebAuthenticationSession?

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { window ?? NSWindow() }

    private func b64url(_ d: Data) -> String {
        d.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
    private func random(_ n: Int) -> String {
        var bytes = [UInt8](repeating: 0, count: n)
        _ = SecRandomCopyBytes(kSecRandomDefault, n, &bytes)
        return b64url(Data(bytes))
    }
    /// "123-abc.apps.googleusercontent.com" → "com.googleusercontent.apps.123-abc"
    private func reversed(_ clientId: String) -> String {
        clientId.split(separator: ".").reversed().joined(separator: ".")
    }

    private func tokenRequest(_ params: [String: String], completion: @escaping (Result<[String: Any], Error>) -> Void) {
        var req = URLRequest(url: URL(string: "https://oauth2.googleapis.com/token")!)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        req.httpBody = params.map { "\($0.key)=\($0.value.addingPercentEncoding(withAllowedCharacters: allowed) ?? "")" }
            .joined(separator: "&").data(using: .utf8)
        URLSession.shared.dataTask(with: req) { data, _, err in
            if let err = err { return completion(.failure(err)) }
            guard let data = data, let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
                return completion(.failure(NSError(domain: "auth", code: 1, userInfo: [NSLocalizedDescriptionKey: "Respuesta inválida"])))
            }
            if let e = json["error"] as? String {
                return completion(.failure(NSError(domain: "auth", code: 2, userInfo: [NSLocalizedDescriptionKey: e])))
            }
            completion(.success(json))
        }.resume()
    }

    /// Renueva el id_token con el refresh token guardado (sin interfaz).
    func silent(clientId: String, completion: @escaping (Result<String, Error>) -> Void) {
        guard let refresh = Keychain.load() else {
            return completion(.failure(NSError(domain: "auth", code: 3, userInfo: [NSLocalizedDescriptionKey: "no-session"])))
        }
        tokenRequest(["grant_type": "refresh_token", "refresh_token": refresh, "client_id": clientId]) { r in
            switch r {
            case .success(let json):
                if let id = json["id_token"] as? String { completion(.success(id)) }
                else { completion(.failure(NSError(domain: "auth", code: 4, userInfo: [NSLocalizedDescriptionKey: "sin id_token"]))) }
            case .failure(let e):
                if (e as NSError).localizedDescription == "invalid_grant" { Keychain.delete() }
                completion(.failure(e))
            }
        }
    }

    /// Inicio de sesión interactivo en una ventana segura del sistema.
    func signIn(clientId: String, completion: @escaping (Result<String, Error>) -> Void) {
        let verifier = random(48)
        let challenge = b64url(Data(SHA256.hash(data: Data(verifier.utf8))))
        let state = random(24)
        let callbackScheme = reversed(clientId)
        let redirect = "\(callbackScheme):/oauth2redirect"
        var c = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        c.queryItems = [
            .init(name: "client_id", value: clientId), .init(name: "redirect_uri", value: redirect),
            .init(name: "response_type", value: "code"), .init(name: "scope", value: "openid email profile"),
            .init(name: "code_challenge", value: challenge), .init(name: "code_challenge_method", value: "S256"),
            .init(name: "state", value: state), .init(name: "prompt", value: "select_account"),
        ]
        let s = ASWebAuthenticationSession(url: c.url!, callbackURLScheme: callbackScheme) { [weak self] url, err in
            guard let self = self else { return }
            if let err = err as? ASWebAuthenticationSessionError, err.code == .canceledLogin {
                return completion(.failure(NSError(domain: "auth", code: 0, userInfo: [NSLocalizedDescriptionKey: "cancelado"])))
            }
            if let err = err { return completion(.failure(err)) }
            guard let url = url, let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
                  items.first(where: { $0.name == "state" })?.value == state,
                  let code = items.first(where: { $0.name == "code" })?.value else {
                return completion(.failure(NSError(domain: "auth", code: 5, userInfo: [NSLocalizedDescriptionKey: "Respuesta de Google no válida"])))
            }
            self.tokenRequest(["grant_type": "authorization_code", "code": code, "client_id": clientId,
                               "redirect_uri": redirect, "code_verifier": verifier]) { r in
                switch r {
                case .success(let json):
                    if let refresh = json["refresh_token"] as? String { Keychain.save(refresh) }
                    if let id = json["id_token"] as? String { completion(.success(id)) }
                    else { completion(.failure(NSError(domain: "auth", code: 6, userInfo: [NSLocalizedDescriptionKey: "sin id_token"]))) }
                case .failure(let e): completion(.failure(e))
                }
            }
        }
        s.presentationContextProvider = self
        s.prefersEphemeralWebBrowserSession = false
        session = s
        s.start()
    }
}

// MARK: - Ventana principal

final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKUIDelegate, WKNavigationDelegate, WKDownloadDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    let auth = GoogleAuth()

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        let webRoot = Bundle.main.resourceURL!.appendingPathComponent("web")
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(BundleSchemeHandler(root: webRoot), forURLScheme: scheme)
        config.websiteDataStore = .default()
        config.userContentController.add(self, name: "notas")

        if selfTest {
            config.userContentController.addUserScript(WKUserScript(
                source: "window.__errs=[];addEventListener('error',e=>__errs.push(String(e.message)));",
                injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        webView = WKWebView(frame: .zero, configuration: config)
        webView.uiDelegate = self
        webView.navigationDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        webView.setValue(false, forKey: "drawsBackground")
        if #available(macOS 13.3, *) { webView.isInspectable = true }

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1240, height: 820),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                          backing: .buffered, defer: false)
        window.title = appName
        window.titlebarAppearsTransparent = true
        window.minSize = NSSize(width: 640, height: 420)
        window.contentView = webView
        window.center()
        window.setFrameAutosaveName("NotasDeLMain")
        window.makeKeyAndOrderFront(nil)
        auth.window = window

        webView.load(URLRequest(url: URL(string: "\(scheme)://app/index.html")!))
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    // Puente JS → nativo
    func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.securityOrigin.protocol == scheme,
              let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        let clientId = body["clientId"] as? String ?? ""
        let reply: (Result<String, Error>) -> Void = { [weak self] r in
            var payload: [String: String] = [:]
            switch r {
            case .success(let token): payload["idToken"] = token
            case .failure(let e): payload["error"] = e.localizedDescription
            }
            let json = String(data: try! JSONSerialization.data(withJSONObject: payload), encoding: .utf8)!
            DispatchQueue.main.async { self?.webView.evaluateJavaScript("window.NC && NC.sync && NC.sync._nativeResult(\(json))") }
        }
        switch type {
        case "googleSignIn": auth.signIn(clientId: clientId, completion: reply)
        case "googleSilent": auth.silent(clientId: clientId, completion: reply)
        case "googleSignOut": Keychain.delete()
        default: break
        }
    }

    // Enlaces externos → navegador predeterminado
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url, ["http", "https", "mailto"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }
        return nil
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if action.shouldPerformDownload { return decisionHandler(.download) }
        guard let url = action.request.url else { return decisionHandler(.cancel) }
        if url.scheme == scheme || url.scheme == "blob" || url.scheme == "data" || url.scheme == "about" { return decisionHandler(.allow) }
        if action.targetFrame?.isMainFrame == true {
            NSWorkspace.shared.open(url)
            return decisionHandler(.cancel)
        }
        decisionHandler(.allow)
    }

    // Descargas (exportar Markdown / copia de seguridad)
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String,
                  completionHandler: @escaping (URL?) -> Void) {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = suggestedFilename
        panel.beginSheetModal(for: window) { r in completionHandler(r == .OK ? panel.url : nil) }
    }

    // <input type="file">
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = false
        panel.beginSheetModal(for: window) { r in completionHandler(r == .OK ? panel.urls : nil) }
    }

    // alert / confirm
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping () -> Void) {
        let a = NSAlert()
        a.messageText = appName
        a.informativeText = message
        a.beginSheetModal(for: window) { _ in completionHandler() }
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert()
        a.messageText = appName
        a.informativeText = message
        a.addButton(withTitle: "Aceptar")
        a.addButton(withTitle: "Cancelar")
        a.beginSheetModal(for: window) { r in completionHandler(r == .alertFirstButtonReturn) }
    }

    // Menús: imprescindibles para ⌘C/⌘V/⌘Z dentro del editor
    func buildMenu() {
        let main = NSMenu()
        func add(_ title: String, _ items: [NSMenuItem]) {
            let item = NSMenuItem()
            let menu = NSMenu(title: title)
            items.forEach { menu.addItem($0) }
            item.submenu = menu
            main.addItem(item)
        }
        func mi(_ t: String, _ a: Selector?, _ k: String, _ m: NSEvent.ModifierFlags = .command) -> NSMenuItem {
            let i = NSMenuItem(title: t, action: a, keyEquivalent: k)
            i.keyEquivalentModifierMask = m
            return i
        }
        add(appName, [mi("Acerca de \(appName)", #selector(NSApplication.orderFrontStandardAboutPanel(_:)), ""), .separator(),
                      mi("Ocultar \(appName)", #selector(NSApplication.hide(_:)), "h"),
                      mi("Ocultar otras", #selector(NSApplication.hideOtherApplications(_:)), "h", [.command, .option]), .separator(),
                      mi("Salir de \(appName)", #selector(NSApplication.terminate(_:)), "q")])
        add("Edición", [mi("Deshacer", Selector(("undo:")), "z"), mi("Rehacer", Selector(("redo:")), "z", [.command, .shift]), .separator(),
                        mi("Cortar", #selector(NSText.cut(_:)), "x"), mi("Copiar", #selector(NSText.copy(_:)), "c"),
                        mi("Pegar", #selector(NSText.paste(_:)), "v"), mi("Seleccionar todo", #selector(NSText.selectAll(_:)), "a")])
        add("Visualización", [mi("Recargar", #selector(reload), "r"),
                              mi("Pantalla completa", #selector(NSWindow.toggleFullScreen(_:)), "f", [.command, .control])])
        add("Ventana", [mi("Minimizar", #selector(NSWindow.performMiniaturize(_:)), "m"), mi("Zoom", #selector(NSWindow.performZoom(_:)), "")])
        NSApp.mainMenu = main
    }

    @objc func reload() { webView.reload() }

    // Autoprueba para desarrollo: NOTAS_SELFTEST=1 imprime el estado de la página y cierra la app.
    let selfTest = ProcessInfo.processInfo.environment["NOTAS_SELFTEST"] != nil
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard selfTest else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
            let js = """
            (function(){ var r={}; try { localStorage.setItem('__t','1'); r.localStorage = localStorage.getItem('__t')==='1'; } catch(e){ r.localStorage=String(e); }
            r.origin=location.origin; r.title=document.title; r.app=!!document.querySelector('.sidebar');
            r.blocks=document.querySelectorAll('.block-row').length; r.errors=window.__errs; r.idb=typeof indexedDB;
            r.secure=window.isSecureContext; r.firebase=typeof firebase; r.saved=!!localStorage.getItem('notioncito:v1');
            return JSON.stringify(r); })()
            """
            webView.evaluateJavaScript(js) { res, err in
                print("SELFTEST", res ?? "nil", err?.localizedDescription ?? "")
                fflush(stdout)
                NSApp.terminate(nil)
            }
        }
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.activate(ignoringOtherApps: true)
app.run()
