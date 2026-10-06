<?php
// Reuse original Shopware calculators and its final CashRounding EUR math boundary.
// This does not reimplement pricing or move PHP into the production runtime.
ob_start();
require __DIR__ . '/price.php';
$prices = json_decode(ob_get_clean(), true, 512, JSON_THROW_ON_ERROR);
$config = new \Shopware\Core\Framework\DataAbstractionLayer\Pricing\CashRoundingConfig(2, 0.01, false);
$result = [];
foreach ($prices as $price) {
    $total = $rounding->mathRound($price['total_price'], $config);
    $result[] = ['total' => $total, 'minor' => (int) round($total * 100)];
}
echo json_encode($result, JSON_THROW_ON_ERROR);
