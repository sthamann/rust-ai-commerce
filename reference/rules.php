<?php declare(strict_types=1);
require __DIR__ . '/vendor/autoload.php';
use Shopware\Core\Framework\Rule\RuleComparison;
$out=[];
foreach (json_decode(stream_get_contents(STDIN),true,512,JSON_THROW_ON_ERROR) as $v) {
    try {$out[]=RuleComparison::numeric($v['item'],$v['rule'],$v['operator']);}
    catch (Throwable $e) {$out[]=['error'=>true];}
}
echo json_encode($out,JSON_THROW_ON_ERROR);
