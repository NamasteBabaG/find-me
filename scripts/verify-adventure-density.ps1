param([ValidateSet('giza','amazon','newyork','paris','marrakech','tokyo','greatwall','sydney','antarctica')][string]$Board='giza',[switch]$TrayAlreadyOpen,[int]$StartItem=1,[int]$StartHide=0)
$ErrorActionPreference='Stop'
$commands=[System.Collections.Generic.List[object]]::new()
for($itemIndex=$StartItem;$itemIndex -le 6;$itemIndex++){
 if(-not($TrayAlreadyOpen -and $itemIndex -eq $StartItem)){$commands.Add(@('click','.discovery-tray__toggle'))}
 $selector='.discovery-tray__panel li:nth-child('+$itemIndex+') button'
 $commands.Add(@('scrollintoview',$selector));$commands.Add(@('click',$selector))
 for($hint=0;$hint -lt 3;$hint++){$commands.Add(@('click','.discovery-tray__focus button:first-of-type'))}
 $commands.Add(@('wait','800'));$commands.Add(@('click','.discovery-hint-region'))
}
$commands.Add(@('screenshot',"storage/adventure-density-preflight/$Board-collected.png"))
for($hide=$StartHide;$hide -lt 3;$hide++){
 for($hint=0;$hint -lt 3;$hint++){$commands.Add(@('click','.mission__hintbtn'))}
 $commands.Add(@('wait','800'));$commands.Add(@('click','.stage__glow'));$commands.Add(@('wait','4500'))
}
$commands.Add(@('snapshot','-i'));$commands.Add(@('screenshot',"storage/adventure-density-preflight/$Board-complete.png"))
$check="(()=>{const a=JSON.parse(localStorage.getItem('findme:album:v1:game_adventure_bar_density_verify_v3'));const b='adventure-$Board';const f=a.finds.filter(x=>x.boardSlug===b).length,d=a.discoveries.filter(x=>x.boardSlug===b).length;if(f!==3||d!==6)throw Error('Expected 3 finds and 6 discoveries, got '+f+' and '+d);return {board:b,finds:f,discoveries:d,visibleChildren:document.querySelectorAll('[data-target]').length};})()"
$commands.Add(@('eval',$check))
# Actual pointer clicks via the browser, never game-store injection.
ConvertTo-Json -InputObject $commands.ToArray() -Depth 5 -Compress | & npx.cmd --yes agent-browser --session density-verify batch --bail
if($LASTEXITCODE -ne 0){throw 'Density browser verification stopped'}
