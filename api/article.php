<?php

require_once 'db.php';
require_once 'auth.php';
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}
$user = authenticate_token();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $id = $_GET['id'] ?? null;

    $stmt = $pdo->prepare('
        SELECT a.*, u.name as author_name 
        FROM articles a 
        LEFT JOIN users u ON a.author_id = u.id 
        WHERE a.id = ?
    ');
    $stmt->execute([$id]);
    $article = $stmt->fetch();

    if ($article) {
        $article['tags'] = json_decode($article['tags'], true);
        echo json_encode($article);
    } else {
        http_response_code(404);
        echo json_encode(['error' => 'Article not found']);
    }
}