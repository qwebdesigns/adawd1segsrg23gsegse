<?php


require_once 'db.php';
require_once 'auth.php';
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$user = authenticate_token();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $section_id = $_GET['section_id'] ?? null;
    $stmt = $pdo->prepare('SELECT * FROM categories WHERE section_id = ? ORDER BY position ASC');
    $stmt->execute([$section_id]);
    echo json_encode($stmt->fetchAll());
} elseif ($method === 'POST') {
    check_role($user, ['editor', 'admin']);
    $data = json_decode(file_get_contents('php://input'), true);

    $stmt = $pdo->prepare('INSERT INTO categories (section_id, name, position) VALUES (?, ?, ?)');
    $stmt->execute([$data['section_id'], $data['name'], $data['position'] ?? 0]);

    http_response_code(201);
    echo json_encode(['id' => $pdo->lastInsertId(), 'name' => $data['name']]);
} elseif ($method === 'DELETE') {
    check_role($user, ['editor', 'admin']);
    $id = $_GET['id'] ?? null;

    if ($id) {
        $stmt = $pdo->prepare('DELETE FROM categories WHERE id = ?');
        $stmt->execute([$id]);
        echo json_encode(['success' => true]);
    }
}