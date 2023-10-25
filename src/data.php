<?php
  include '../../private/wind/stuff.php';

  header("Content-Type: application/json");
  echo json_encode($data);
  exit();
?>