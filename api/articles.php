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
    $category_id = $_GET['category_id'] ?? null;
    $stmt = $pdo->prepare('SELECT id, title, tags, updated_at FROM articles WHERE category_id = ? ORDER BY created_at DESC');
    $stmt->execute([$category_id]);
    $articles = $stmt->fetchAll();

    foreach ($articles as &$article) {
        $article['tags'] = json_decode($article['tags'], true);
    }
    echo json_encode($articles);
} elseif ($method === 'POST') {
    check_role($user, ['editor', 'admin']);
    $data = json_decode(file_get_contents('php://input'), true);
    $tags = isset($data['tags']) ? json_encode($data['tags'], JSON_UNESCAPED_UNICODE) : null;

    $stmt = $pdo->prepare('INSERT INTO articles (category_id, section_id, title, content, tags, author_id) VALUES (?, ?, ?, ?, ?, ?)');
    $stmt->execute([$data['category_id'], $data['section_id'], $data['title'], $data['content'], $tags, $user['id']]);

    http_response_code(201);
    echo json_encode(['id' => $pdo->lastInsertId()]);
} elseif ($method === 'PUT') {
    check_role($user, ['editor', 'admin']);
    $data = json_decode(file_get_contents('php://input'), true);
    $tags = isset($data['tags']) ? json_encode($data['tags'], JSON_UNESCAPED_UNICODE) : null;

    $stmt = $pdo->prepare('UPDATE articles SET category_id = ?, title = ?, content = ?, tags = ? WHERE id = ?');
    $stmt->execute([$data['category_id'], $data['title'], $data['content'], $tags, $data['id']]);

    echo json_encode(['id' => $data['id']]);
} elseif ($method === 'DELETE') {
    check_role($user, ['editor', 'admin']);
    $id = $_GET['id'] ?? null;

    if ($id) {
        $stmt = $pdo->prepare('DELETE FROM articles WHERE id = ?');
        $stmt->execute([$id]);
        echo json_encode(['success' => true]);
    }
}