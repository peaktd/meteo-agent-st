<?php
session_start();
header('Content-Type: application/json');

if (!isset($_SESSION['score']))     $_SESSION['score'] = 0;
if (!isset($_SESSION['completed'])) $_SESSION['completed'] = [];
if (!isset($_SESSION['artifacts'])) $_SESSION['artifacts'] = [];
if (!isset($_SESSION['mgWon']))     $_SESSION['mgWon'] = false;
if (!isset($_SESSION['comfort']))   $_SESSION['comfort'] = [];

$input = json_decode(file_get_contents('php://input'), true) ?: [];
$action = $input['action'] ?? $_GET['action'] ?? '';

switch ($action) {
  case 'save':
    if (isset($input['score']))     $_SESSION['score'] = (int)$input['score'];
    if (isset($input['completed'])) $_SESSION['completed'] = (array)$input['completed'];
    if (isset($input['artifacts'])) $_SESSION['artifacts'] = (array)$input['artifacts'];
    if (isset($input['mgWon']))     $_SESSION['mgWon'] = (bool)$input['mgWon'];
    if (isset($input['comfort']))   $_SESSION['comfort'] = (array)$input['comfort'];
    echo json_encode(['ok' => true]);
    break;

  case 'load':
    echo json_encode([
      'ok' => true,
      'score'     => $_SESSION['score'],
      'completed' => $_SESSION['completed'],
      'artifacts' => $_SESSION['artifacts'],
      'mgWon'     => $_SESSION['mgWon'],
      'comfort'   => $_SESSION['comfort'],
    ], JSON_UNESCAPED_UNICODE);
    break;

  case 'reset':
    session_destroy();
    echo json_encode(['ok' => true]);
    break;

  default:
    echo json_encode(['ok' => false, 'error' => 'unknown action']);
}