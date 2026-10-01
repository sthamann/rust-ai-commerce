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
use Shopware\Core\Checkout\Cart\Price\Struct\ReferencePriceDefinition;
use Shopware\Core\Checkout\Cart\Tax\Struct\TaxRule;
use Shopware\Core\Checkout\Cart\Tax\Struct\TaxRuleCollection;
use Shopware\Core\Framework\DataAbstractionLayer\Pricing\CashRoundingConfig;
$cases = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
$rounding = new CashRounding(); $tax = new TaxCalculator();
$gross = new GrossPriceCalculator($tax, $rounding);
$net = new NetPriceCalculator($tax, $rounding);
$output = [];
foreach ($cases as $i) {
    $rules = array_key_exists('tax_rules', $i) && $i['tax_rules'] !== null ? array_map(fn($r) => new TaxRule($r['tax_rate'], $r['percentage']), $i['tax_rules']) : [new TaxRule($i['tax_rate'])];
    $definition = new QuantityPriceDefinition($i['price'], new TaxRuleCollection($rules), $i['quantity']);
    if (isset($i['list_price'])) $definition->setListPrice($i['list_price']);
    if (isset($i['regulation_price'])) $definition->setRegulationPrice($i['regulation_price']);
    if (isset($i['reference'])) { $r=$i['reference']; $definition->setReferencePriceDefinition(new ReferencePriceDefinition($r['purchase_unit'],$r['reference_unit'],$r['unit_name'])); }
    $definition->setIsCalculated($i['calculated'] ?? true);
    $config = new CashRoundingConfig($i['decimals'] ?? 2, $i['interval'] ?? 0.01, $i['round_for_net'] ?? false);
    $p = (($i['gross'] ?? true) ? $gross : $net)->calculate($definition, $config);
    $taxAmount = 0.; foreach ($p->getCalculatedTaxes() as $t) $taxAmount += $t->getTax();
    $ref=$p->getReferencePrice(); $list=$p->getListPrice(); $reg=$p->getRegulationPrice();
    $output[] = ['unit_price'=>$p->getUnitPrice(), 'total_price'=>$p->getTotalPrice(), 'tax'=>$taxAmount, 'quantity'=>$p->getQuantity(),
      'calculated_taxes'=>array_values(array_map(fn($t)=>['tax'=>$t->getTax(),'tax_rate'=>$t->getTaxRate(),'price'=>$t->getPrice()], $p->getCalculatedTaxes()->getElements())),
      'list_price'=>$list ? ['price'=>$list->getPrice(),'discount'=>$list->getDiscount(),'percentage'=>$list->getPercentage()] : null,
      'regulation_price'=>$reg? $reg->getPrice():null,
      'reference_price'=>$ref? ['price'=>$ref->getPrice(),'purchase_unit'=>$ref->getPurchaseUnit(),'reference_unit'=>$ref->getReferenceUnit(),'unit_name'=>$ref->getUnitName()]:null];
}
echo json_encode($output, JSON_THROW_ON_ERROR);
