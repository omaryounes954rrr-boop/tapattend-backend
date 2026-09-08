import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:nfc_manager/nfc_manager.dart';
import 'package:uuid/uuid.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const TapAttendApp());
}

class TapAttendApp extends StatelessWidget {
  const TapAttendApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'TapAttend',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF14B8A6), brightness: Brightness.dark),
        useMaterial3: true,
      ),
      home: const Gate(),
    );
  }
}

class Gate extends StatefulWidget {
  const Gate({super.key});
  @override
  State<Gate> createState() => _GateState();
}

class _GateState extends State<Gate> {
  final api = TapAttendApi();
  bool loading = true;
  bool signedIn = false;

  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    final token = await api.token();
    setState(() {
      signedIn = token != null;
      loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    return signedIn
        ? HomePage(api: api, onLogout: () => setState(() => signedIn = false))
        : LoginPage(api: api, onLogin: () => setState(() => signedIn = true));
  }
}

class LoginPage extends StatefulWidget {
  const LoginPage({super.key, required this.api, required this.onLogin});
  final TapAttendApi api;
  final VoidCallback onLogin;
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final email = TextEditingController();
  final password = TextEditingController();
  String? error;
  bool busy = false;

  Future<void> _submit() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.api.login(email.text.trim(), password.text);
      widget.onLogin();
    } catch (e) {
      setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('TapAttend', style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            const Text('سجّل الحضور بمسح QR أو لمس NFC'),
            const SizedBox(height: 24),
            TextField(controller: email, decoration: const InputDecoration(labelText: 'البريد')),
            const SizedBox(height: 12),
            TextField(controller: password, obscureText: true, decoration: const InputDecoration(labelText: 'كلمة المرور')),
            const SizedBox(height: 16),
            FilledButton(onPressed: busy ? null : _submit, child: const Text('دخول')),
            if (error != null) Text(error!, style: const TextStyle(color: Colors.redAccent)),
          ],
        ),
      ),
    );
  }
}

class HomePage extends StatefulWidget {
  const HomePage({super.key, required this.api, required this.onLogout});
  final TapAttendApi api;
  final VoidCallback onLogout;
  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  Map<String, dynamic>? me;
  String? message;
  String? error;
  List<dynamic> logs = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<String> _deviceId() async {
    final prefs = await SharedPreferences.getInstance();
    var id = prefs.getString('device_id');
    if (id == null) {
      id = const Uuid().v4();
      await prefs.setString('device_id', id);
    }
    return id;
  }

  Future<void> _load() async {
    try {
      final profile = await widget.api.me();
      final mine = await widget.api.mine();
      setState(() {
        me = profile;
        logs = mine;
      });
    } catch (e) {
      setState(() => error = e.toString());
    }
  }

  Future<(double?, double?)> _coords() async {
    final permission = await Geolocator.requestPermission();
    if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
      return (null, null);
    }
    final pos = await Geolocator.getCurrentPosition();
    return (pos.latitude, pos.longitude);
  }

  Future<void> _send(String token, String method) async {
    setState(() {
      error = null;
      message = null;
    });
    try {
      final coords = await _coords();
      final result = await widget.api.scan(
        tokenUid: token,
        method: method,
        lat: coords.$1,
        lng: coords.$2,
        deviceId: await _deviceId(),
      );
      setState(() => message = result['message'] as String? ?? 'تم');
      await _load();
    } catch (e) {
      setState(() => error = e.toString());
    }
  }

  Future<void> _qr() async {
    final token = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const QrScanPage()),
    );
    if (token != null && token.isNotEmpty) await _send(token, 'qr');
  }

  Future<void> _nfc() async {
    final available = await NfcManager.instance.isAvailable();
    if (!available) {
      setState(() => error = 'NFC غير متاح على هذا الجهاز');
      return;
    }
    NfcManager.instance.startSession(onDiscovered: (tag) async {
      final id = tag.data['nfca']?['identifier'] ?? tag.data['ndef']?['identifier'];
      String token;
      if (id is List) {
        token = id.map((b) => (b as int).toRadixString(16).padLeft(2, '0')).join();
      } else {
        token = id?.toString() ?? tag.handle;
      }
      await NfcManager.instance.stopSession();
      await _send(token, 'nfc');
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(me?['full_name']?.toString() ?? 'TapAttend'),
        actions: [
          IconButton(
            onPressed: () async {
              await widget.api.setToken(null);
              widget.onLogout();
            },
            icon: const Icon(Icons.logout),
          )
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(me?['org_name']?.toString() ?? '', style: const TextStyle(fontSize: 18)),
          const SizedBox(height: 16),
          FilledButton.icon(onPressed: _qr, icon: const Icon(Icons.qr_code_scanner), label: const Text('مسح QR')),
          const SizedBox(height: 10),
          OutlinedButton.icon(onPressed: _nfc, icon: const Icon(Icons.nfc), label: const Text('لمس بطاقة NFC')),
          if (message != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(message!, style: const TextStyle(color: Colors.tealAccent))),
          if (error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(error!, style: const TextStyle(color: Colors.redAccent))),
          const SizedBox(height: 24),
          const Text('سجلي', style: TextStyle(fontWeight: FontWeight.bold)),
          ...logs.map((row) {
            final map = Map<String, dynamic>.from(row as Map);
            return ListTile(
              title: Text(map['event_type'] == 'in' ? 'حضور' : 'انصراف'),
              subtitle: Text('${map['scan_method']} · ${map['recorded_at']}'),
            );
          }),
        ],
      ),
    );
  }
}

class QrScanPage extends StatelessWidget {
  const QrScanPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('مسح الرمز')),
      body: MobileScanner(
        onDetect: (capture) {
          final value = capture.barcodes.first.rawValue;
          if (value != null) Navigator.of(context).pop(value);
        },
      ),
    );
  }
}
