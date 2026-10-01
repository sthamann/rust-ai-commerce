<?php
// Invoke original 6.7.14.2 methods via Reflection. No reimplementation of selectors.
require getenv('SHOPWARE_AUTOLOAD') ?: __DIR__.'/vendor/autoload.php';
use Doctrine\DBAL\DriverManager;
use Symfony\Component\EventDispatcher\EventDispatcher;
use Shopware\Core\System\SalesChannel\Context\ContextFactory;
use Shopware\Core\System\SalesChannel\SalesChannelContext;
use Shopware\Core\System\SalesChannel\SalesChannelException;
use Shopware\Core\Framework\Context;
use Shopware\Core\Framework\Api\Context\SystemSource;
use Shopware\Core\Content\Product\SalesChannel\Price\ProductPriceCalculator;
use Shopware\Core\Content\Product\Cart\ProductCartProcessor;
use Shopware\Core\Content\Product\Aggregate\ProductPrice\ProductPriceEntity;
use Shopware\Core\Content\Product\Aggregate\ProductPrice\ProductPriceCollection;
use Shopware\Core\Content\Product\SalesChannel\SalesChannelProductEntity;
use Shopware\Core\Checkout\Cart\Price\Struct\CalculatedPrice;
use Shopware\Core\Checkout\Cart\Price\Struct\PriceCollection;
use Shopware\Core\Checkout\Cart\Tax\Struct\CalculatedTaxCollection;
use Shopware\Core\Checkout\Cart\Tax\Struct\TaxRuleCollection;
$cases=json_decode(stream_get_contents(STDIN),true,512,JSON_THROW_ON_ERROR);
$connection=DriverManager::getConnection(['driver'=>'pdo_sqlite','memory'=>true]);
$connection->executeStatement('CREATE TABLE language(id BLOB,parent_id BLOB)');
$factory=new ContextFactory($connection,new EventDispatcher());
$chain=new ReflectionMethod(ContextFactory::class,'buildLanguageChain');
$calculator=(new ReflectionClass(ProductPriceCalculator::class))->newInstanceWithoutConstructor();
$filter=new ReflectionMethod(ProductPriceCalculator::class,'filterRulePrices');
$processor=(new ReflectionClass(ProductCartProcessor::class))->newInstanceWithoutConstructor();
$quantity=new ReflectionMethod(ProductCartProcessor::class,'fixQuantity');
$definition=new ReflectionMethod(ProductCartProcessor::class,'getPriceDefinition');
$price=fn($value,$q)=>new CalculatedPrice($value,$value*$q,new CalculatedTaxCollection(),new TaxRuleCollection(),$q);
$output=[];
foreach($cases as $c){
 if($c['kind']==='quantity'){$output[]=['quantity'=>$quantity->invoke($processor,$c['min'],$c['current'],$c['steps'])];continue;}
 if($c['kind']==='language'){
  $connection->executeStatement('DELETE FROM language');
  foreach($c['languages'] as $l){$connection->executeStatement('INSERT INTO language(id,parent_id) VALUES(?,?)',[hex2bin($l['id']),isset($l['parent_id'])?hex2bin($l['parent_id']):null]);}
  try{$output[]=['chain'=>$chain->invoke($factory,[], $c['current'],$c['available'])];}
  catch(\Shopware\Core\Framework\ShopwareHttpException $e){$map=[SalesChannelException::LANGUAGE_INVALID_EXCEPTION=>'invalid-language-id',SalesChannelException::SALES_CHANNEL_LANGUAGE_NOT_AVAILABLE_EXCEPTION=>'language-unavailable',SalesChannelException::LANGUAGE_NOT_FOUND=>'language-not-found'];$output[]=['error'=>$map[$e->getErrorCode()]];}
  continue;
 }
 $ctx=(new ReflectionClass(SalesChannelContext::class))->newInstanceWithoutConstructor();
 (new ReflectionProperty(SalesChannelContext::class,'context'))->setValue($ctx,new Context(new SystemSource(),$c['rules']));
 $tiers=new ProductPriceCollection();
 foreach($c['tiers'] as $i=>$t){$p=new ProductPriceEntity();$p->setId(str_pad(dechex($i+1),32,'0',STR_PAD_LEFT));$p->setRuleId($t['rule_id']);$p->setQuantityStart($t['quantity_start']);$p->setQuantityEnd($t['quantity_end']);$p->addExtension('fixtureDiscount',new \Shopware\Core\Framework\Struct\ArrayStruct(['value'=>$t['discount']]));$tiers->add($p);}
 $selected=$filter->invoke($calculator,$tiers,$ctx);
 if(!$selected){$output[]=['discount'=>null];continue;}
 // This is the original collection sort used by calculateAdvancePrices. The
 // calculated-price quantities are its original quantityEnd ?? quantityStart.
 $selected->sortByQuantity();$calculated=new PriceCollection();
 foreach($selected as $t){$calculated->add($price($t->getExtension('fixtureDiscount')->get('value'),$t->getQuantityEnd()??$t->getQuantityStart()));}
 $product=new SalesChannelProductEntity();$product->setCalculatedPrice($price(0,1));$product->setCalculatedPrices($calculated);
 $output[]=['discount'=>$definition->invoke($processor,$product,$c['quantity'])->getPrice()];
}
echo json_encode($output,JSON_THROW_ON_ERROR);
