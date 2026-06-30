<?php


require_once 'db.php';
require_once 'auth.php';
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$user = authenticate_token();
check_role($user, ['editor', 'admin']);

if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $data = json_decode(file_get_contents('php://input'), true);
    $order = $data['order'] ?? [];
    
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('UPDATE sections SET position = ? WHERE id = ?');
        foreach ($order as $index => $id) {
            $stmt->execute([$index, $id]);
        }
        $pdo->commit();
        echo json_encode(['success' => true]);
    } catch (Exception $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['error' => 'Reorder failed']);
    }
}