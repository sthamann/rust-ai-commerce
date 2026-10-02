<?php
// Original Shopware 6.7.14.2 proportional shipping tax rule builder.
require getenv('SHOPWARE_AUTOLOAD') ?: __DIR__.'/vendor/autoload.php';
use Shopware\Core\Checkout\Cart\Tax\PercentageTaxRuleBuilder;
use Shopware\Core\Checkout\Cart\Tax\Struct\CalculatedTax;
use Shopware\Core\Checkout\Cart\Tax\Struct\CalculatedTaxCollection;
$cases=json_decode(stream_get_contents(STDIN),true,512,JSON_THROW_ON_ERROR);$builder=new PercentageTaxRuleBuilder();$out=[];
foreach($cases as $c){$taxes=new CalculatedTaxCollection(array_map(fn($v)=>new CalculatedTax($v['tax'],$v['tax_rate'],$v['price']),$c['taxes']));$rules=$builder->buildCollectionRules($taxes,$c['total']);$out[]=array_values(array_map(fn($v)=>['tax_rate'=>$v->getTaxRate(),'percentage'=>$v->getPercentage()],$rules->getElements()));}
echo json_encode($out,JSON_THROW_ON_ERROR);
