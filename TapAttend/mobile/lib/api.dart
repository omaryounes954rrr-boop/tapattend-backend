import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class TapAttendApi {
  TapAttendApi({this.baseUrl = 'http://127.0.0.1:8000'});

  final String baseUrl;
  static const _tokenKey = 'tapattend_token';

  Future<String?> token() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_tokenKey);
  }

  Future<void> setToken(String? value) async {
    final prefs = await SharedPreferences.getInstance();
    if (value == null) {
      await prefs.remove(_tokenKey);
    } else {
      await prefs.setString(_tokenKey, value);
    }
  }

  Future<Map<String, dynamic>> _parse(http.Response res) async {
    final body = jsonDecode(res.body.isEmpty ? '{}' : res.body);
    if (res.statusCode >= 400) {
      throw Exception(body['detail'] ?? 'Request failed');
    }
    return Map<String, dynamic>.from(body as Map);
  }

  Future<Map<String, dynamic>> login(String email, String password) async {
    final res = await http.post(
      Uri.parse('$baseUrl/api/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );
    final data = await _parse(res);
    await setToken(data['access_token'] as String);
    return data;
  }

  Future<Map<String, dynamic>> me() async {
    final t = await token();
    final res = await http.get(
      Uri.parse('$baseUrl/api/auth/me'),
      headers: {'Authorization': 'Bearer $t'},
    );
    return _parse(res);
  }

  Future<Map<String, dynamic>> scan({
    required String tokenUid,
    required String method,
    double? lat,
    double? lng,
    required String deviceId,
  }) async {
    final t = await token();
    final res = await http.post(
      Uri.parse('$baseUrl/api/attendance/scan'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $t',
      },
      body: jsonEncode({
        'token_uid': tokenUid,
        'scan_method': method,
        'latitude': lat,
        'longitude': lng,
        'device_id': deviceId,
      }),
    );
    return _parse(res);
  }

  Future<List<dynamic>> mine() async {
    final t = await token();
    final res = await http.get(
      Uri.parse('$baseUrl/api/attendance/mine'),
      headers: {'Authorization': 'Bearer $t'},
    );
    final body = jsonDecode(res.body);
    if (res.statusCode >= 400) {
      throw Exception(body['detail'] ?? 'Request failed');
    }
    return body as List<dynamic>;
  }
}
