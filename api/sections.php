<?php

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');

require_once 'db.php';
require_once 'auth.php';

$user = authenticate_token();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $stmt = $pdo->query('SELECT * FROM sections ORDER BY position ASC');
    echo json_encode($stmt->fetchAll());
} elseif ($method === 'POST') {
    check_role($user, ['editor', 'admin']);
    $data = json_decode(file_get_contents('php://input'), true);

    $stmt = $pdo->prepare('INSERT INTO sections (name, icon_key, color, description, position) VALUES (?, ?, ?, ?, ?)');
    $stmt->execute([
        $data['name'],
        $data['icon_key'] ?? 'folder',
        $data['color'] ?? '#7c3aed',
        $data['description'] ?? null,
        $data['position'] ?? 0
    ]);
    http_response_code(201);
    echo json_encode(['id' => $pdo->lastInsertId(), 'name' => $data['name']]);
} elseif ($method === 'PUT') {
    check_role($user, ['editor', 'admin']);
    $data = json_decode(file_get_contents('php://input'), true);

    $stmt = $pdo->prepare('UPDATE sections SET name=?, icon_key=?, color=?, description=?, position=? WHERE id=?');
    $stmt->execute([
        $data['name'],
        $data['icon_key'],
        $data['color'],
        $data['description'],
        $data['position'],
        $data['id']
    ]);
    echo json_encode(['id' => $data['id']]);
} elseif ($method === 'DELETE') {
    check_role($user, ['editor', 'admin']);
    $id = $_GET['id'] ?? null;

    if ($id) {
        $stmt = $pdo->prepare('DELETE FROM sections WHERE id=?');
        $stmt->execute([$id]);
        
        http_response_code(200);
        echo json_encode(['success' => true]);
        exit;
    } else {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'ID missing']);
        exit;
    }
}
