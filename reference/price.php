<?php
// Runs original upstream classes, not a PHP rewrite of our Rust calculation.
$autoload = getenv('SHOPWARE_AUTOLOAD') ?: __DIR__ . '/vendor/autoload.php';
if (!is_file($autoload)) { fwrite(STDERR, "Install reference/composer.json or set SHOPWARE_AUTOLOAD\n"); exit(2); }
require $autoload;
use Shopware\Core\Checkout\Cart\Price\CashRounding;
use Shopware\Core\Checkout\Cart\Tax\TaxCalculator;
use Shopware\Core\Checkout\Cart\Price\GrossPriceCalculator;
use Shopware\Core\Checkout\Cart\Price\NetPriceCalculator;
use Shopware\Core\Checkout\Cart\Price\Struct\QuantityPriceDefinition;
use Shopware\Core\Checkout\Cart\Tax\Struct\TaxRule;
use Shopware\Core\Checkout\Cart\Tax\Struct\TaxRuleCollection;
use Shopware\Core\Framework\DataAbstractionLayer\Pricing\CashRoundingConfig;
$cases = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
$rounding = new CashRounding(); $tax = new TaxCalculator();
$gross = new GrossPriceCalculator($tax, $rounding);
$net = new NetPriceCalculator($tax, $rounding);
$output = [];
foreach ($cases as $i) {
    $definition = new QuantityPriceDefinition($i['price'], new TaxRuleCollection([new TaxRule($i['tax_rate'])]), $i['quantity']);
    $definition->setIsCalculated($i['calculated'] ?? true);
    $config = new CashRoundingConfig($i['decimals'] ?? 2, $i['interval'] ?? 0.01, $i['round_for_net'] ?? false);
    $p = (($i['gross'] ?? true) ? $gross : $net)->calculate($definition, $config);
    $taxAmount = 0.; foreach ($p->getCalculatedTaxes() as $t) $taxAmount += $t->getTax();
    $output[] = ['unit_price'=>$p->getUnitPrice(), 'total_price'=>$p->getTotalPrice(), 'tax'=>$taxAmount, 'quantity'=>$p->getQuantity()];
}
echo json_encode($output, JSON_THROW_ON_ERROR);
