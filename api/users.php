<?php


require_once 'db.php';
require_once 'auth.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$user = authenticate_token();
check_role($user, ['admin']);
$method = $_SERVER['REQUEST_METHOD'];

function generateRandomPassword($length = 10)
{
    return substr(str_shuffle('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'), 0, $length);
}

if ($method === 'GET') {
    $stmt = $pdo->query('SELECT id, email, name, role, created_at FROM users');
    echo json_encode($stmt->fetchAll());
} elseif ($method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $plain_password = generateRandomPassword();
    $hash = password_hash($plain_password, PASSWORD_BCRYPT);

    $stmt = $pdo->prepare('INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)');
    $stmt->execute([$data['email'], $hash, $data['name'], $data['role']]);

    http_response_code(201);
    echo json_encode([
        'id' => $pdo->lastInsertId(),
        'email' => $data['email'],
        'password' => $plain_password
    ]);
} elseif ($method === 'PUT') {
    $data = json_decode(file_get_contents('php://input'), true);
    $stmt = $pdo->prepare('UPDATE users SET role = ? WHERE id = ?');
    $stmt->execute([$data['role'], $data['id']]);
    echo json_encode(['success' => true]);
} elseif ($method === 'DELETE') {
    $id = $_GET['id'] ?? null;
    if ($id == $user['id']) {
        http_response_code(400);
        echo json_encode(['error' => 'Cannot delete yourself']);
        exit;
    }

    $stmt = $pdo->prepare('DELETE FROM users WHERE id = ?');
    $stmt->execute([$id]);
    echo json_encode(['success' => true]);
}