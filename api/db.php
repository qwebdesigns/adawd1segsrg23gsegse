<?php
// Отключаем вообще все выводы ошибок, чтобы они не ломали HTTP/2
error_reporting(0);
ini_set('display_errors', 0);

// Заголовки только здесь
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit; // Выход сразу, без подключения БД
}

// Конфигурация базы данных
define('DB_HOST', 'localhost');
define('DB_USER', 'd140548_sapp_dat');
define('DB_PASS', 'a4h0ks2npwijeeg9b4');
define('DB_NAME', 'd140548_sapp_database');
define('JWT_SECRET', 'super_secret_key_for_zarub_kb');

try {
    $pdo = new PDO("mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4", DB_USER, DB_PASS);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed']);
    exit;
}