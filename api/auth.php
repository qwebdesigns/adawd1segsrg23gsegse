<?php

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');
function generate_jwt($payload, $secret)
{
    $header = json_encode(['typ' => 'JWT', 'alg' => 'HS256']);
    $base64UrlHeader = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($header));
    $base64UrlPayload = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode(json_encode($payload)));
    $signature = hash_hmac('sha256', $base64UrlHeader . "." . $base64UrlPayload, $secret, true);
    $base64UrlSignature = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($signature));
    return $base64UrlHeader . "." . $base64UrlPayload . "." . $base64UrlSignature;
}

function verify_jwt($token, $secret)
{
    $parts = explode('.', $token);
    if (count($parts) !== 3)
        return false;
    $signature = hash_hmac('sha256', $parts[0] . "." . $parts[1], $secret, true);
    $base64UrlSignature = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($signature));
    if (hash_equals($base64UrlSignature, $parts[2])) {
        $payload = json_decode(base64_decode(str_replace(['-', '_'], ['+', '/'], $parts[1])), true);
        if (isset($payload['exp']) && $payload['exp'] < time())
            return false;
        return $payload;
    }
    return false;
}

function authenticate_token()
{
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    $token = str_replace('Bearer ', '', $authHeader);

    if (!$token) {
        http_response_code(401);
        echo json_encode(['error' => 'Token required']);
        exit;
    }

    $user = verify_jwt($token, JWT_SECRET);
    if (!$user) {
        http_response_code(403);
        echo json_encode(['error' => 'Invalid or expired token']);
        exit;
    }
    return $user;
}

function check_role($user, $allowed_roles)
{
    if (!in_array($user['role'], $allowed_roles)) {
        http_response_code(403);
        echo json_encode(['error' => 'Access denied']);
        exit;
    }
}