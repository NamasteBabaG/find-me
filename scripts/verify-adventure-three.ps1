param([ValidateSet('giza','amazon','newyork')][string]$Board='giza',[int]$StartItem=1,[int]$StartHide=0,[string]$Session='adventure-bar-verify',[string]$GameId='game_adventure_bar_verification_v1')
$ErrorActionPreference='Stop'
function Invoke-PilotBrowser {
  param([Parameter(ValueFromRemainingArguments=$true)][string[]]$BrowserArgs)
  & npx.cmd --yes agent-browser --session $Session @BrowserArgs
  if ($LASTEXITCODE -ne 0) { throw 'Browser verification stopped' }
}
# Run against the already-open, separate verification game. Uses actual pointer
# clicks through the viewport, no store injection or localStorage modification.
for($ItemIndex=$StartItem;$ItemIndex -le 6;$ItemIndex++) {
  Invoke-PilotBrowser @('click','.discovery-tray__toggle')
  $ItemSelector = '.discovery-tray__panel li:nth-child(' + $ItemIndex + ') button'
  Invoke-PilotBrowser @('scrollintoview',$ItemSelector)
  Invoke-PilotBrowser @('click',$ItemSelector)
  for($Hint=0;$Hint -lt 3;$Hint++){Invoke-PilotBrowser @('click','.discovery-tray__focus button:first-of-type')}
  Invoke-PilotBrowser @('wait','800')
  Invoke-PilotBrowser @('click','.discovery-hint-region')
}
Invoke-PilotBrowser @('screenshot',"storage/adventure-three-preflight/$Board-collected.png")
for($Hide=$StartHide;$Hide -lt 3;$Hide++) {
  for($Hint=0;$Hint -lt 3;$Hint++){Invoke-PilotBrowser @('click','.mission__hintbtn')}
  Invoke-PilotBrowser @('wait','800')
  Invoke-PilotBrowser @('click','.stage__glow')
  Invoke-PilotBrowser @('wait','4500')
}
Invoke-PilotBrowser @('snapshot','-i')
Invoke-PilotBrowser @('screenshot',"storage/adventure-three-preflight/$Board-complete.png")
$Check = "(()=>{const a=JSON.parse(localStorage.getItem('findme:album:v1:$GameId'));const b='adventure-$Board';const f=a.finds.filter(x=>x.boardSlug===b).length,d=a.discoveries.filter(x=>x.boardSlug===b).length;if(f!==3||d!==6)throw Error('Expected 3 finds + 6 discoveries, got '+f+' + '+d);return {board:b,finds:f,discoveries:d,visibleChildren:document.querySelectorAll('[data-target]').length};})()"
$Check | & npx.cmd --yes agent-browser --session $Session eval --stdin
if($LASTEXITCODE -ne 0){throw 'Progress assertion failed'}
