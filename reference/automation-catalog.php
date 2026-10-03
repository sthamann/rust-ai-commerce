<?php declare(strict_types=1);
// Export actual production Rule subclasses and action names from the pinned MIT Core.
require __DIR__.'/vendor/autoload.php';
$root=__DIR__.'/vendor/shopware/core'; $rules=[]; $actions=[];
foreach(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root)) as $file){
 $path=(string)$file;
 if((!str_ends_with($path,'Rule.php')&&!str_ends_with($path,'Action.php')) || preg_match('~/Tests?/|/DevOps/~',$path))continue;
 $text=file_get_contents($path);
 if(!preg_match('/namespace ([^;]+);/',$text,$ns)||!preg_match('/^(?:final |abstract )?class (\w+)/m',$text,$cls))continue;
 $class=$ns[1].'\\'.$cls[1]; if(!class_exists($class))continue;
 $reflection=new ReflectionClass($class);if($reflection->isAbstract())continue;
 if(is_subclass_of($class,Shopware\Core\Framework\Rule\Rule::class)){
  $constructor=$reflection->getConstructor();
  $object=(!$constructor||$constructor->getNumberOfRequiredParameters()===0)?$reflection->newInstance():$reflection->newInstanceWithoutConstructor();
  $name=$object->getName(); $config=null;$constraints=[];
  try{$config=$object->getConfig()?->getData();}catch(Throwable){}
  try{foreach($object->getConstraints() as $key=>$list)$constraints[$key]=array_map(fn($c)=>get_class($c),$list);}catch(Throwable){}
  $rules[]=['type'=>$name,'class'=>$class,'source'=>substr($path,strlen($root)+1),'config'=>$config,'constraints'=>$constraints];
 }
 if(is_subclass_of($class,Shopware\Core\Content\Flow\Dispatching\Action\FlowAction::class)){
  try{$actions[]=['name'=>$class::getName(),'source'=>substr($path,strlen($root)+1)];}catch(Throwable){}
 }
}
usort($rules,fn($a,$b)=>strcmp($a['type'],$b['type']));usort($actions,fn($a,$b)=>strcmp($a['name'],$b['name']));
echo json_encode(['upstream'=>'shopware/core 6.7.14.2','conditions'=>$rules,'actions'=>$actions],JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR)."\n";
