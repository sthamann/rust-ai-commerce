<?php declare(strict_types=1);
// Original MIT Shopware classes execute independently from the native registry evaluator.
require __DIR__.'/vendor/autoload.php';
use Shopware\Core\Checkout\Cart\Cart;
use Shopware\Core\Checkout\Cart\LineItem\LineItem;
use Shopware\Core\Checkout\Cart\Price\Struct\CalculatedPrice;
use Shopware\Core\Checkout\Cart\Price\Struct\CartPrice;
use Shopware\Core\Checkout\Cart\Tax\Struct\CalculatedTaxCollection;
use Shopware\Core\Checkout\Cart\Tax\Struct\TaxRuleCollection;
use Shopware\Core\Checkout\Cart\Delivery\Struct\DeliveryInformation;
use Shopware\Core\System\SalesChannel\SalesChannelContext;
function put(object $o,array $data):object{foreach($data as $key=>$value){if(property_exists($o,$key))(new ReflectionProperty($o,$key))->setValue($o,$value);}return $o;}
function entity(string $class,array $data):object{return put(new $class(),$data);}
function price(array $line):CalculatedPrice{return new CalculatedPrice((float)($line['unitPrice']??0),(float)($line['totalPrice']??0),new CalculatedTaxCollection(),new TaxRuleCollection(),(int)($line['quantity']??1));}
function scope(array $f):object{
 $context=Shopware\Core\Framework\Context::createDefaultContext();
 put($context,['currencyId'=>$f['currency']??'EUR','languageIdChain'=>[$f['language']??'en-GB']]);
 $sc=entity(Shopware\Core\System\SalesChannel\SalesChannelEntity::class,['id'=>$f['salesChannel']??'default']);
 $group=entity(Shopware\Core\Checkout\Customer\Aggregate\CustomerGroup\CustomerGroupEntity::class,['id'=>$f['customer']['group']??'consumer']);
 $country=entity(Shopware\Core\System\Country\CountryEntity::class,['id'=>$f['shipping']['country']??'DE','iso3'=>'DEU']);
 $address=function(array $a)use($country){return entity(Shopware\Core\Checkout\Customer\Aggregate\CustomerAddress\CustomerAddressEntity::class,['id'=>'address','country'=>$country,'countryId'=>$a['country']??null,'countryStateId'=>$a['countryStateId']??null,'city'=>$a['city']??null,'street'=>$a['street']??null,'zipcode'=>$a['zipcode']??null]);};
 $state=entity(Shopware\Core\System\Country\Aggregate\CountryState\CountryStateEntity::class,['id'=>$f['shipping']['countryStateId']??'']);
 $shipping=$address($f['shipping']??[]);$billing=$address($f['billing']??[]);put($shipping,['countryState'=>$state]);
 $customer=null;$v=$f['customer']??[];
 if($v['loggedIn']??false){$customer=entity(Shopware\Core\Checkout\Customer\CustomerEntity::class,['id'=>'customer','email'=>$v['email']??'','active'=>$v['active']??true,'guest'=>$v['guest']??false,'groupId'=>$v['group']??'consumer','requestedGroupId'=>$v['requestedGroupId']??null,'salutation'=>entity(Shopware\Core\System\Salutation\SalutationEntity::class,['id'=>$v['salutationId']??'']),'salutationId'=>$v['salutationId']??null,'lastName'=>$v['lastName']??'','company'=>$v['isCompany']??false?'Example':null,'customerNumber'=>$v['customerNumber']??'C-1','orderCount'=>$v['orderCount']??0,'orderTotalAmount'=>(float)($v['orderTotalAmount']??0),'reviewCount'=>$v['reviewCount']??0,'affiliateCode'=>$v['affiliateCode']??null,'campaignCode'=>$v['campaignCode']??null,'newsletter'=>$v['newsletter']??false,'createdById'=>$v['createdByAdmin']??false?'admin':null,'activeBillingAddress'=>$billing,'activeShippingAddress'=>$shipping,'customFields'=>$v['customFields']??[], 'birthday'=>isset($v['birthday'])?new DateTime($v['birthday']):null]);}
 $sales=(new ReflectionClass(SalesChannelContext::class))->newInstanceWithoutConstructor();put($sales,['context'=>$context,'salesChannel'=>$sc,'customer'=>$customer,'currentCustomerGroup'=>$group,'currency'=>entity(Shopware\Core\System\Currency\CurrencyEntity::class,['id'=>$f['currency']??'EUR']),'paymentMethod'=>entity(Shopware\Core\Checkout\Payment\PaymentMethodEntity::class,['id'=>$f['checkout']['paymentMethodId']??'demo-card']),'shippingMethod'=>entity(Shopware\Core\Checkout\Shipping\ShippingMethodEntity::class,['id'=>$f['checkout']['shippingMethodId']??'pickup']),'shippingLocation'=>new Shopware\Core\Checkout\Cart\Delivery\Struct\ShippingLocation($country,null,$shipping)]);
 $sales->setTaxState($f['price']['taxStatus']??'gross');
 $cart=new Cart('test');$cart->setPrice(new CartPrice((float)($f['price']['netPrice']??0),(float)($f['price']['totalPrice']??0),(float)($f['price']['positionPrice']??0),new CalculatedTaxCollection(),new TaxRuleCollection(),$f['price']['taxStatus']??'gross'));
 foreach($f['lines']??[] as $index=>$v){$li=new LineItem('line-'.$index,$v['type']??'product',$v['referencedId']??'mug',(int)($v['quantity']??1));$li->setGood($v['good']??true);$li->setPrice(price($v));$li->setDeliveryInformation(new DeliveryInformation((int)($v['availableStock']??0),(float)($v['weight']??0),$v['shippingFree']??false,null,null,(float)($v['height']??0),(float)($v['width']??0),(float)($v['length']??0)));$li->setPayload(['parentId'=>$v['parentId']??null,'stock'=>$v['stock']??0,'isCloseout'=>$v['closeout']??false,'isNew'=>$v['isNew']??false,'categoryIds'=>$v['categoryIds']??[],'streamIds'=>$v['streamIds']??[],'manufacturerId'=>$v['manufacturerId']??null,'propertyIds'=>$v['propertyIds']??[],'optionIds'=>$v['optionIds']??[],'taxId'=>$v['taxId']??null,'customFields'=>$v['customFields']??[],'purchasePrices'=>isset($v['purchasePrices'])?json_encode($v['purchasePrices']):null,'markAsTopseller'=>$v['promoted']??false]);$cart->add($li);}
 return new Shopware\Core\Checkout\Cart\Rule\CartRuleScope($cart,$sales);
}
$registry=json_decode(file_get_contents(__DIR__.'/automation-source.json'),true,512,JSON_THROW_ON_ERROR);$classes=[];foreach($registry['conditions'] as $row)$classes[$row['type']]=$row['class'];
function rule(array $node):object{global $classes;$class=$classes[$node['type']];$r=new ReflectionClass($class);$obj=(!$r->getConstructor()||$r->getConstructor()->getNumberOfRequiredParameters()===0)?$r->newInstance():$r->newInstanceWithoutConstructor();$config=$node['config'];if(isset($config['children'])){$config['rules']=array_map('rule',$config['children']);unset($config['children']);}if(isset($config['container']))$config['container']=rule($config['container']);if(isset($config['filter']))$config['filter']=rule($config['filter']);put($obj,$config);if($obj instanceof Shopware\Core\Framework\Rule\DateRangeRule)$obj->__wakeup();return $obj;}
$out=[];foreach(json_decode(stream_get_contents(STDIN),true,512,JSON_THROW_ON_ERROR) as $v){try{Symfony\Component\Clock\Clock::set(new Symfony\Component\Clock\MockClock($v['facts']['currentTime']??'2026-10-03T12:00:00Z'));$out[]=rule(['type'=>$v['name'],'config'=>$v['config']])->match(scope($v['facts']));}catch(Throwable $e){$out[]=['error'=>$e->getMessage()];}}
echo json_encode($out,JSON_THROW_ON_ERROR);
