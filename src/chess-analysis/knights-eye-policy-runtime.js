/* eslint-disable @typescript-eslint/no-unused-vars -- Canonical compatibility regions retain historical bytes, including legacy helper/catch bindings. */
/** Canonical native Knight's Eye policy. The marked function regions also produce
 * app-owned compatibility strings at build time; never evaluate strings here.
 * Policy 45 uses board offers and outcome evidence for Brilliant; older rules remain. */
export const CLASSIFIER_VERSION = 45;

/** Chess is injected. window below is a closure-local chess.js compatibility
 * binding, never the browser window. Omitted history callbacks match the former
 * application adapter's empty/null fallbacks. Caches are private unless a
 * prepared consumer explicitly supplies getters for its live runtime caches. */
export function createKnightsEyePolicyRuntime(Chess, engineKind = 'stockfish', historyContext = {}, preparedCaches = {}) {
  // Prepared consumers own cache invalidation. Resolve the current host object
  // for every access so replacing a cache at an epoch boundary takes effect.
  function preparedCache(getCurrent) {
    return getCurrent ? new Proxy({}, {
      get(_target, key) { return getCurrent()[key]; },
      set(_target, key, value) { getCurrent()[key] = value; return true; },
    }) : {};
  }
  var window = {ChessJs: {Chess: Chess}}, files = 'abcdefgh', sacrificeVerificationCache = preparedCache(preparedCaches.sacrificeVerification);
  function normalizedFen(fen) { return String(fen || '').trim().replace(/\s+/g, ' '); }
  function sanForMove(fen, uci) { var chess = new Chess(fen); return chess.move({from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q'}).san; }
  function priorOwnBeforeFenForPosition(...args) { return historyContext.priorOwnBeforeFenForPosition ? historyContext.priorOwnBeforeFenForPosition(...args) : ''; }
  function treePreviousMoveForFen(...args) { return historyContext.treePreviousMoveForFen ? historyContext.treePreviousMoveForFen(...args) : null; }

// BEGIN COMPATIBILITY REGION POSITION_RULES_SOURCE

    function parseFen(fen){var parts=fen.split(' '), rows=parts[0].split('/'), board={};rows.forEach(function(row,r){var c=0;for(var i=0;i<row.length;i++){var ch=row[i];if(/\d/.test(ch))c+=Number(ch);else{board[files[c]+(8-r)]=ch;c++;}}});return {board:board,turn:parts[1],castling:parts[2],ep:parts[3],tail:parts.slice(4)};}
    function toFen(pos){var rows=[];for(var r=8;r>=1;r--){var row='',empty=0;for(var c=0;c<8;c++){var p=pos.board[files[c]+r];if(p){if(empty){row+=empty;empty=0}row+=p}else empty++}if(empty)row+=empty;rows.push(row)}return rows.join('/')+' '+pos.turn+' '+pos.castling+' '+pos.ep+' '+pos.tail.join(' ');}
    function applyMove(fen,uci){var p=parseFen(fen),from=uci.slice(0,2),to=uci.slice(2,4),piece=p.board[from];if(!piece)return fen;var target=p.board[to],capture=!!target,oldTurn=p.turn,half=Math.max(0,Number(p.tail[0])||0),full=Math.max(1,Number(p.tail[1])||1),rights=p.castling==='-'?'':p.castling;delete p.board[from];if((piece==='P'||piece==='p')&&to===p.ep&&!target){delete p.board[to[0]+from[1]];capture=true}if((piece==='K'||piece==='k')&&Math.abs(files.indexOf(from[0])-files.indexOf(to[0]))===2){var rank=from[1],kingSide=to[0]==='g',rf=(kingSide?'h':'a')+rank,rt=(kingSide?'f':'d')+rank;p.board[rt]=p.board[rf];delete p.board[rf]}if(piece==='K')rights=rights.replace(/[KQ]/g,'');if(piece==='k')rights=rights.replace(/[kq]/g,'');if(from==='a1'||to==='a1')rights=rights.replace('Q','');if(from==='h1'||to==='h1')rights=rights.replace('K','');if(from==='a8'||to==='a8')rights=rights.replace('q','');if(from==='h8'||to==='h8')rights=rights.replace('k','');p.board[to]=uci[4]?(piece===piece.toUpperCase()?uci[4].toUpperCase():uci[4]):piece;p.castling=rights||'-';p.ep='-';if((piece==='P'||piece==='p')&&Math.abs(Number(to[1])-Number(from[1]))===2)p.ep=from[0]+((Number(from[1])+Number(to[1]))/2);p.turn=oldTurn==='w'?'b':'w';p.tail=[String(piece.toLowerCase()==='p'||capture?0:half+1),String(full+(oldTurn==='b'?1:0))];return toFen(p);}
	    function moveUci(m){return m&&m.uci?m.uci:m.from+m.to+(m.promotion||'')}
// END COMPATIBILITY REGION POSITION_RULES_SOURCE

// BEGIN COMPATIBILITY REGION CLASSIFIER_RULES_SOURCE

    function advanceMaterialExchangeState(previousState,move,beforeFen){var previous=previousState||{},active=(previous.activeThreads||[]).map(function(thread){return {originFen:String(thread.originFen||''),targetSquare:String(thread.targetSquare||''),creatorUci:String(thread.creatorUci||''),lastCaptureUci:String(thread.lastCaptureUci||'')}}).filter(function(thread){return !!thread.originFen&&!!thread.targetSquare}),from=String(move&&move.from||''),to=String(move&&move.to||''),uci=String(move&&move.uci||from+to),capture=!!(move&&move.capture),capturedSquare=String(move&&move.capturedSquare||to),matched=capture?active.filter(function(thread){return thread.targetSquare===capturedSquare}):[],remaining=[],transitions=[],settled=false;active.forEach(function(thread){if(capture&&thread.targetSquare===capturedSquare){transitions.push({kind:'continues',originFen:thread.originFen,targetSquare:thread.targetSquare});return}if(thread.targetSquare===from){settled=true;transitions.push({kind:'settles',originFen:thread.originFen,targetSquare:thread.targetSquare});return}remaining.push(thread)});var inherited=matched.length>0,originFen=capture?String(inherited&&matched[0].originFen||beforeFen||''):'';if(capture){var next={originFen:originFen,targetSquare:to,creatorUci:String(inherited&&matched[0].creatorUci||uci),lastCaptureUci:uci};remaining=remaining.filter(function(thread){return thread.targetSquare!==to});remaining.push(next);if(!inherited)transitions.push({kind:'creates',originFen:originFen,targetSquare:to})}if(!transitions.length&&remaining.length)transitions.push({kind:'retains'});return {transition:inherited?'continues':capture?'creates':settled?'settles':remaining.length?'retains':'none',originFen:originFen,inherited:inherited,activeThreads:remaining.slice(-8),transitions:transitions}}
    function enduringMaterialOffer(netLosses,requiredPlies){var path=netLosses||[],plies=Math.max(1,Number(requiredPlies)||path.length||1);if(path.length<plies)return 0;return Math.max(0,Math.min.apply(null,path.slice(0,plies).map(function(netLoss){return Math.max(0,Number(netLoss)||0)})))}
    function materialConversionGain(netLosses,requiredPlies){var path=netLosses||[],plies=Math.max(1,Number(requiredPlies)||path.length||1);if(path.length<plies)return 0;return Math.max(0,-(Number(path[plies-1])||0))}
    // Historical compatibility helpers, retained for prepared consumers only.
    // No Brilliant or Interesting decision reads either function below.
    function lastingMaterialDeficit(netLosses,converted){var path=netLosses||[],end=path.length;if(converted){end=-1;for(var i=0;i<path.length;i++)if(Number(path[i])<0){end=i;break}if(end<=0)return 0}var segment=path.slice(0,end);if(!segment.length)return 0;return Math.max(0,Math.min.apply(null,segment.map(function(netLoss){return Math.max(0,Number(netLoss)||0)})))}
    function directRecoveryResidualOffer(initialOffer,recoveryNetLosses){var offer=Math.max(0,Number(initialOffer)||0),recoveries=(recoveryNetLosses||[]).map(function(netLoss){return Number(netLoss)||0});if(!recoveries.length)return offer;return Math.min(offer,Math.max(0,Math.min.apply(null,recoveries)))}
    function qualifyingMaterialOffer(initialOffer,netLosses,requiredPlies,minConversionGain,favorableMate){var offer=Math.max(0,Number(initialOffer)||0),path=netLosses||[],windowPlies=Math.max(1,Number(requiredPlies)||path.length||1),conversionPlies=Math.max(windowPlies,path.length),persistent=Math.min(offer,enduringMaterialOffer(path,windowPlies)),conversionGain=materialConversionGain(path,conversionPlies),minimumGain=Math.max(1,Number(minConversionGain)||50),converted=conversionGain>=minimumGain,lastingDeficit=favorableMate||converted?lastingMaterialDeficit(path,converted):persistent;return favorableMate||converted?(lastingDeficit>0?offer:0):persistent}
    function hasTacticalSacrificePayoff(signal){var minimumGain=Math.max(1,Number(signal.minimumConversionGain)||50),minOffer=Math.max(1,Number(signal.minOffer)||0),converted=(Number(signal.materialConversionGain)||0)>=minimumGain,strongCompensation=(Number(signal.persistentMaterialOffer)||0)>=minOffer&&Number(signal.acceptedEp)>=.60;return !!signal.favorableMate||converted||strongCompensation}
    function qualifiesAsSacrificeOffer(signal){return !!signal.sound&&!!signal.notBad&&!!signal.notAlreadyWon&&!!signal.acceptedSound&&(Number(signal.materialOffer)||0)>=(Number(signal.minOffer)||0)}
    function poisonedCapture(board,capture){var from=capture&&capture.from,piece=board&&board[from];if(!from||!piece||piece.toLowerCase()==='q')return false;var white=piece===piece.toUpperCase(),boardFiles='abcdefgh',fromFile=boardFiles.indexOf(from[0]),fromRank=Number(from[1]);return Object.keys(board).some(function(queenSquare){var queen=board[queenSquare];if(!queen||queen.toLowerCase()!=='q'||(queen===queen.toUpperCase())!==white)return false;var queenFile=boardFiles.indexOf(queenSquare[0]),queenRank=Number(queenSquare[1]),dx=fromFile-queenFile,dy=fromRank-queenRank,diagonal=Math.abs(dx)===Math.abs(dy),straight=dx===0||dy===0;if(!diagonal&&!straight)return false;var stepFile=dx===0?0:(dx>0?1:-1),stepRank=dy===0?0:(dy>0?1:-1),file=queenFile+stepFile,rank=queenRank+stepRank;while(file!==fromFile||rank!==fromRank){if(board[boardFiles[file]+rank])return false;file+=stepFile;rank+=stepRank}file+=stepFile;rank+=stepRank;while(file>=0&&file<8&&rank>=1&&rank<=8){var attacker=board[boardFiles[file]+rank];if(attacker){var kind=attacker.toLowerCase(),enemy=(attacker===attacker.toUpperCase())!==white;return enemy&&(kind==='q'||diagonal&&kind==='b'||straight&&kind==='r')}file+=stepFile;rank+=stepRank}return false})}
    function cleanMaterialOpportunity(signal){var capturedValue=Math.max(0,Number(signal.capturedValue)||0),minimumGain=Math.max(1,Number(signal.minimumGain)||100),immediateGain=Number(signal.immediateGain)||0,recaptureGains=(signal.recaptureGains||[]).map(function(gain){return Number(gain)||0}),allGains=[immediateGain].concat(recaptureGains),worstCaseMaterialGain=allGains.length?Math.min.apply(null,allGains):0,reason=!signal.legal?'illegal-best-move':!signal.capture?'best-move-not-capture':capturedValue<100?'captured-material-below-pawn':signal.routineRecapture?'routine-recapture':signal.poisonedCapture?'poisoned-capture':worstCaseMaterialGain<minimumGain?'insufficient-retained-gain':'clean-material-win';return {qualifies:reason==='clean-material-win',opportunityType:'clean_material_win',bestMove:String(signal.bestMove||''),bestMoveSan:String(signal.bestMoveSan||''),capturedPiece:String(signal.capturedPiece||''),capturedValue:capturedValue,immediateMaterialGain:immediateGain,worstCaseMaterialGain:worstCaseMaterialGain,legalRecaptureCount:recaptureGains.length,minimumGain:minimumGain,inheritedExchange:!!signal.inheritedExchange,routineRecapture:!!signal.routineRecapture,poisonedCapture:!!signal.poisonedCapture,reason:reason}}
    function minimumSacrificeOffer(){return 120}
    function brilliantEpLossLimit(){return .025}
    function interestingEpLossLimit(){return .05}
    function classificationUtility(outcomeEp,mate){var probability=Math.max(0,Math.min(1,Number(outcomeEp)||0));if(mate==null||!Number(mate))return probability;var distance=Math.max(1,Math.min(256,Math.abs(Number(mate)))),mateStrength=.016*(257-distance);return Number(mate)>0?1+mateStrength:-mateStrength}
    function mateAwareQualityLoss(bestUtility,playedUtility,bestMate,playedMate){var loss=Math.max(0,Number(bestUtility)-Number(playedUtility)),sameMateBand=bestMate!=null&&playedMate!=null&&Number(bestMate)!==0&&Number(playedMate)!==0&&(Number(bestMate)>0)===(Number(playedMate)>0);return sameMateBand?Math.min(.07,loss):loss}
    function mateDistanceDifference(bestMate,playedMate){if(bestMate==null||playedMate==null||Number(bestMate)<=0||Number(playedMate)<=0)return null;return Math.max(0,Math.abs(Number(playedMate))-Math.abs(Number(bestMate)))}
    function classifyMissedMate(signal){if(!signal.missedImmediateMate&&!signal.abandonedForcedMate)return'';var afterEp=Math.max(0,Math.min(1,Number(signal.afterEp)||0)),winningLine=Number(signal.winningLine)||.72,notBadLine=Number(signal.notBadLine)||.40;if(afterEp>=winningLine)return'miss';if(afterEp>=notBadLine)return'mistake';return'blunder'}
    function qualifiesAsInterestingOffer(signal){var loss=Math.max(0,Number(signal.epLoss)||0);return !signal.mateMove&&!signal.brilliant&&loss>Number(signal.brilliantLossLimit)&&loss<=Number(signal.interestingLossLimit)&&!!signal.notBad&&!!signal.notAlreadyWon&&!!signal.acceptedSound&&!!signal.tacticalPayoff&&(Number(signal.materialOffer)||0)>=(Number(signal.minOffer)||0)}
    function isOnlyViableMove(bestEp,secondEp){return bestEp-secondEp>=.075}
    function isAdvancedPassedPawn(board,square,white){var pawn=board&&board[square],rank=Number(square&&square[1]),file='abcdefgh'.indexOf(square&&square[0]);if(!pawn||pawn.toLowerCase()!=='p'||file<0||(white?rank<6:rank>3))return false;return !Object.keys(board).some(function(candidate){var piece=board[candidate],candidateRank=Number(candidate[1]),candidateFile='abcdefgh'.indexOf(candidate[0]),enemyPawn=piece&&(piece===piece.toUpperCase())!==white&&piece.toLowerCase()==='p';return enemyPawn&&Math.abs(candidateFile-file)<=1&&(white?candidateRank>rank:candidateRank<rank)})}
    function isAdvancedTacticalPawn(board,square,white){var pawn=board&&board[square],rank=Number(square&&square[1]),file='abcdefgh'.indexOf(square&&square[0]);if(!pawn||pawn.toLowerCase()!=='p'||file<0||(white?rank<6:rank>3))return false;var targetRank=rank+(white?1:-1),attacksValuable=[file-1,file+1].some(function(targetFile){var piece=board['abcdefgh'[targetFile]+targetRank];return piece&&(piece===piece.toUpperCase())!==white&&'nbrq'.indexOf(piece.toLowerCase())>=0});return attacksValuable||isAdvancedPassedPawn(board,square,white)}
    function routineBlocksGreatMove(routine,onlyViable,uniqueGap,pawnBreakthrough,tacticalConversion){return !!routine&&!tacticalConversion&&!(!!pawnBreakthrough&&!!onlyViable&&uniqueGap>=.09)}
    function qualifiesAsGreatMove(signal){var uniqueGap=signal.uniqueGap==null?(signal.onlyViable?.075:0):Number(signal.uniqueGap);return !signal.mateMove&&!!signal.nearBest&&signal.afterEp>=signal.minAfterEp&&(!!signal.sacrifice||(!signal.evasion&&!signal.routine&&uniqueGap>=.075))}
    function classifyFromSignals(signal){var loss=signal.qualityLoss==null?Math.max(0,Number(signal.epLoss)||0):Math.max(0,Number(signal.qualityLoss)||0),outcomeLoss=signal.outcomeEpLoss==null?Math.max(0,Number(signal.epLoss)||0):Math.max(0,Number(signal.outcomeEpLoss)||0),mateLoss=signal.mateLossClassification||classifyMissedMate(signal),missedOpportunity=!!signal.missedOpportunity||!!signal.missedSpecial||!!signal.missedMaterialOpportunity;if(signal.forced)return 'forced';if(signal.mateMove)return 'best';if(mateLoss)return mateLoss;if(signal.sacrifice)return 'brilliant';if(signal.book)return 'book';if(signal.greatMove)return 'great';if(signal.interestingMove)return 'interesting';if(signal.playedBest||loss<.002)return 'best';if(missedOpportunity&&outcomeLoss>=.08){if(outcomeLoss>.20&&typeof signal.afterEp==='number'&&Number.isFinite(signal.afterEp)&&signal.afterEp<.40)return 'blunder';return 'miss';}if(outcomeLoss>.20)return 'blunder';if(signal.newlyAllowsMate)return 'mistake';if(loss<=.02)return 'good';if(loss<=.05)return 'okay';if(loss<.09)return 'dubious';return 'mistake'}
// END COMPATIBILITY REGION CLASSIFIER_RULES_SOURCE

// BEGIN COMPATIBILITY REGION ANALYSIS_CORE_SOURCE

    function numericScore(r){if(!r)return 0;if(r.mate!=null)return r.mate>0?100000:-100000;return Number(r.scoreCp||0)}
    function expectedPoints(cp){if(cp>=90000)return 1;if(cp<=-90000)return 0;return 1/(1+Math.exp(-cp/420))}
    function outcomeEvaluationForMove(m,before,after,mateMove){var u=moveUci(m),line=((before&&before.candidates)||[]).filter(function(candidate){return ((candidate.pv||[])[0]||candidate.uci||'')===u})[0];if(mateMove||after&&after.terminal&&after.mate===0)return {scoreCp:null,mate:1,source:'checkmate'};if(after&&after.terminal)return {scoreCp:0,mate:null,source:'terminal-position'};if(line)return {scoreCp:line.scoreCp==null?null:Number(line.scoreCp),mate:line.mate==null?null:Number(line.mate),source:'root-candidate'};if(after&&after.mate!=null&&Number(after.mate)!==0){var replyMate=Number(after.mate);return {scoreCp:null,mate:replyMate<0?Math.abs(replyMate)+1:-Math.abs(replyMate),source:'after-position'}}return {scoreCp:after&&after.scoreCp==null?0:-Number(after&&after.scoreCp||0),mate:null,source:'after-position'}}
    // Comparison evidence is local to this edge. Never replace the independent
    // position analyses or use a restricted set to establish uniqueness.
    function comparisonLine(position, uci) {
      return ((position && position.candidates) || []).find(function(line) { return ((line.pv || [])[0] || line.uci) === uci; });
    }
    function comparisonPositionDepth(position) {
      var depths = ((position && position.candidates) || []).map(function(line) { return Number(line.depth) || 0; });
      return Math.max(0, Math.min(Number(position && position.depth) || 0, depths.length ? Math.min.apply(null, depths) : Infinity));
    }
    function independentMoveEvaluation(after, mateMove) {
      return outcomeEvaluationForMove({uci:''}, {}, after, mateMove);
    }
    function sameOutcomeFormatBand(bestEp, playedEp, bestMate, playedMate) {
      return !!bestMate !== !!playedMate && ((bestEp >= winningOutcomeLine() && playedEp >= winningOutcomeLine()) ||
        (bestEp <= 1-winningOutcomeLine() && playedEp <= 1-winningOutcomeLine()));
    }
    function verifiedMateInOne(context) {
      var before = context.beforeAnalysis || {}, uci = before.bestmove;
      if (Number(before.mate) !== 1 || !uci) return false;
      try { var chess = new window.ChessJs.Chess(context.beforeFen); chess.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||'q'}); return chess.isCheckmate(); }
      catch { return false; }
    }
    function usableComparison(context) {
      var comparison = context.comparisonAnalysis, before = context.beforeAnalysis || {};
      if ((context.afterAnalysis||{}).terminal || /#/.test(context.move.san||'')) return null;
      if (!comparison || !comparisonLine(comparison, moveUci(context.move))) return null;
      // A strictly deeper, unrestricted root containing the move supersedes an
      // older local resolution; independent child depth alone never does.
      return comparisonLine(before, moveUci(context.move)) && comparisonPositionDepth(before) > comparisonPositionDepth(comparison) ? null : comparison;
    }
    function classificationComparison(context) {
      var before = context.beforeAnalysis || {}, after = context.afterAnalysis || {}, uci = moveUci(context.move);
      if (usableComparison(context) || /#/.test(context.move.san || '') || after.terminal || verifiedMateInOne(context)) return null;
      var line = comparisonLine(before, uci), child = independentMoveEvaluation(after, false), childEp = evaluationOutcomeEp(child);
      var root = line || before, rootEp = evaluationOutcomeEp(root), opposite = !!root.mate && !!child.mate && (Number(root.mate)>0)!==(Number(child.mate)>0);
      var beforeDepth = comparisonPositionDepth(before), afterDepth = comparisonPositionDepth(after), conflict;
      if (line) {
        conflict = Math.abs(rootEp-childEp) >= .08 || opposite;
        if (!conflict || Math.min(beforeDepth, Number(line.depth)||0) >= afterDepth+1) return null;
      } else {
        var loss = Math.max(0, rootEp-childEp), formatOnly = sameOutcomeFormatBand(rootEp,childEp,root.mate,child.mate);
        var utilityLoss = mateAwareQualityLoss(classificationUtility(rootEp,root.mate),classificationUtility(childEp,child.mate),root.mate,child.mate);
        var unsupportedMateDowngrade = !formatOnly && utilityLoss >= .09 && loss < .02 && !!root.mate !== !!child.mate;
        conflict = childEp-rootEp >= .08 || opposite || unsupportedMateDowngrade;
        if (!conflict) return null;
      }
      var roots = [uci], candidates = (before.candidates || []);
      [before.bestmove].concat(candidates.map(function(candidate){return (candidate.pv||[])[0]||candidate.uci;})).forEach(function(root){
        if (root && roots.indexOf(root)<0 && roots.length<3) roots.push(root);
      });
      return {fen:context.beforeFen,depth:Math.max(1,beforeDepth,afterDepth+1),multiPv:roots.length,rootMoves:roots};
    }
    function admitClassificationComparison(context, request, result) {
      if (!request || request.fen !== context.beforeFen || !Array.isArray(request.rootMoves) || request.rootMoves.length !== request.multiPv ||
        request.rootMoves.indexOf(moveUci(context.move))<0 || (context.beforeAnalysis||{}).bestmove && request.rootMoves.indexOf(context.beforeAnalysis.bestmove)<0 || new Set(request.rootMoves).size !== request.rootMoves.length ||
        !Number.isSafeInteger(request.depth) || request.depth<1 || !result || result.terminal || !Array.isArray(result.candidates) ||
        result.candidates.length !== request.multiPv || !Number.isSafeInteger(result.depth) || result.depth<request.depth) return null;
      var seen = new Set(), lines = [], rootBuilds = new Set(((context.beforeAnalysis||{}).candidates||[]).map(function(line){return line.scoreProvenance&&line.scoreProvenance.engineBuild;}).filter(Boolean));
      try {
        for (var index=0;index<result.candidates.length;index++) {
          var line=result.candidates[index], origin=line&&line.scoreProvenance;
          if (!line || line.lowerbound || line.upperbound || line.multipv!==index+1 || !Number.isSafeInteger(line.depth) || line.depth<request.depth ||
            !Array.isArray(line.pv) || !line.pv.length || line.pv.length>512 || seen.has(line.pv[0]) || request.rootMoves.indexOf(line.pv[0])<0 ||
            !((typeof line.scoreCp==='number'&&Number.isFinite(line.scoreCp)&&line.mate===null)||(line.scoreCp===null&&Number.isSafeInteger(line.mate)&&line.mate!==0)) ||
            origin && (origin.fen!==request.fen || origin.kind!=='root-search' && origin.kind!=='reconciliation-root' || origin.engineBuild && rootBuilds.size && (!rootBuilds.has(origin.engineBuild) || rootBuilds.size!==1))) return null;
          var chess=new window.ChessJs.Chess(request.fen);
          for (var uci of line.pv) { if(typeof uci!=='string'||!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci))return null; chess.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||'q'}); }
          seen.add(line.pv[0]); lines.push(Object.assign({},line,{pv:line.pv.slice(),scoreProvenance:Object.assign({},origin,{kind:'reconciliation-root',fen:request.fen,originatingDepth:line.depth,reportedDepth:line.depth})}));
        }
      } catch { return null; }
      if(request.rootMoves.some(function(root){return !seen.has(root);}) || result.bestmove!==lines[0].pv[0] || result.scoreCp!==lines[0].scoreCp || result.mate!==lines[0].mate || result.depth>Math.min.apply(null,lines.map(function(line){return line.depth;})))return null;
      return Object.assign({},lines[0],{depth:result.depth,bestmove:result.bestmove,candidates:lines});
    }
    function applyClassificationComparison(decision, context) {
      var comparison=usableComparison(context), before=context.beforeAnalysis||{}, uci=moveUci(context.move);
      decision.comparisonSource=decision.mateMove?'checkmate':(context.afterAnalysis||{}).terminal?'terminal-position':comparison?'comparison-root':comparisonLine(before,uci)?'root-candidate':'after-position';
      decision.comparisonBestmove=comparison?comparison.bestmove:before.bestmove||'';
      decision.comparisonDepth=comparisonPositionDepth(comparison||before);
      decision.comparisonCandidates=comparison?comparison.candidates:null;
      if(!comparison)return decision;
      var played=comparisonLine(comparison,uci), bestEp=evaluationOutcomeEp(comparison), afterEp=evaluationOutcomeEp(played), bestMate=comparison.mate, playedMate=played.mate;
      var formatOnly=sameOutcomeFormatBand(bestEp,afterEp,bestMate,playedMate), bestUtility=classificationUtility(bestEp,bestMate), playedUtility=classificationUtility(afterEp,playedMate), epLoss=Math.max(0,bestEp-afterEp);
      decision.beforeCp=numericScore(comparison); decision.afterForMover=numericScore(played); decision.loss=Math.max(0,Math.min(9999,decision.beforeCp-decision.afterForMover));
      decision.bestEp=bestEp; decision.afterEp=afterEp; decision.epLoss=epLoss; decision.bestMate=bestMate; decision.playedMate=playedMate;
      decision.bestUtility=bestUtility; decision.playedUtility=playedUtility;
      decision.qualityLoss=formatOnly?epLoss:mateAwareQualityLoss(bestUtility,playedUtility,bestMate,playedMate);
      decision.playedBest=decision.mateMove||uci===comparison.bestmove; decision.mateDifference=mateDistanceDifference(bestMate,playedMate);
      decision.nearBest=decision.playedBest||(decision.mateDifference!=null&&decision.mateDifference<=1)||decision.qualityLoss<=brilliantEpLossLimit();
      decision.missedImmediateMate=bestMate===1&&playedMate!==1&&verifiedMateInOne(Object.assign({},context,{beforeAnalysis:comparison}));
      decision.abandonedForcedMate=!formatOnly&&bestMate>1&&!(playedMate>0);
      decision.newlyAllowsMate=!formatOnly&&playedMate<0&&!(bestMate<0);
      decision.mateLossClassification=classifyMissedMate({missedImmediateMate:decision.missedImmediateMate,abandonedForcedMate:decision.abandonedForcedMate,afterEp:afterEp,winningLine:winningOutcomeLine(),notBadLine:notBadOutcomeLine()});
      // Restricted evidence may remove unsound special credit, never create it.
      // Its strongest covered alternative can also refute the already-winning
      // condition; a child mate belongs only to the played line.
      var alternative=(comparison.candidates||[]).filter(function(line){return ((line.pv||[])[0]||line.uci)!==uci}).sort(function(a,b){return classificationUtility(evaluationOutcomeEp(b),b.mate==null?null:Number(b.mate))-classificationUtility(evaluationOutcomeEp(a),a.mate==null?null:Number(a.mate))})[0],alternativeEp=alternative?evaluationOutcomeEp(alternative):bestEp,playedMateOnly=!!alternative&&(playedMate!=null&&playedMate>0||playedMate==null&&(context.afterAnalysis||{}).mate!=null&&Number(context.afterAnalysis.mate)<0)&&!(alternative.mate!=null&&Number(alternative.mate)>0);
      decision.alternativeEp=alternativeEp;decision.playedMateOnly=playedMateOnly;
      decision.greatMove=decision.greatMove&&decision.nearBest&&afterEp>=notBadOutcomeLine();
      decision.sacrifice=decision.sacrifice&&decision.nearBest&&isSoundSacrificeForMove(decision.sacrificeVerification,afterEp,alternativeEp,decision.qualityLoss,playedMateOnly);
      decision.interestingMove=decision.interestingMove&&decision.qualityLoss<=interestingEpLossLimit()&&afterEp>=notBadOutcomeLine();
      decision.missedSpecial=!decision.nearBest&&decision.bestSpecial.qualifies;
      return decision;
    }
    function evaluationOutcomeEp(evaluation){return expectedPoints(numericScore(evaluation))}
    function winningOutcomeLine(){return .68}
    function notBadOutcomeLine(){return .40}
    function pieceValue(ch){return ch?({p:100,n:320,b:330,r:500,q:900,k:20000}[ch.toLowerCase()]||0):0}
    function material(pos,white){return Object.keys(pos.board).reduce(function(sum,sq){var pc=pos.board[sq];return sum+(((pc===pc.toUpperCase())===white&&pc.toLowerCase()!=='k')?pieceValue(pc):0)},0)}
    function attacksSquare(pos,from,to){var pc=pos.board[from];if(!pc)return false;var fx=files.indexOf(from[0]),fy=Number(from[1]),tx=files.indexOf(to[0]),ty=Number(to[1]),dx=tx-fx,dy=ty-fy,a=pc.toLowerCase();if(a==='p')return Math.abs(dx)===1&&dy===(pc===pc.toUpperCase()?1:-1);if(a==='n')return (Math.abs(dx)===1&&Math.abs(dy)===2)||(Math.abs(dx)===2&&Math.abs(dy)===1);if(a==='k')return Math.max(Math.abs(dx),Math.abs(dy))===1;var diagonal=Math.abs(dx)===Math.abs(dy),straight=dx===0||dy===0;if((a==='b'&&!diagonal)||(a==='r'&&!straight)||(a==='q'&&!diagonal&&!straight))return false;var sx=dx===0?0:(dx>0?1:-1),sy=dy===0?0:(dy>0?1:-1),x=fx+sx,y=fy+sy;while(x!==tx||y!==ty){if(pos.board[files[x]+y])return false;x+=sx;y+=sy}return true}
    function squareAttacked(pos,sq,byWhite){return Object.keys(pos.board).some(function(from){var pc=pos.board[from];return (pc===pc.toUpperCase())===byWhite&&attacksSquare(pos,from,sq)})}
    function legalMoves(fen){try{return new window.ChessJs.Chess(fen).moves({verbose:true})}catch(e){return[]}}
    function terminalPositionResult(fen,depth){try{var chess=new window.ChessJs.Chess(fen);if(chess.moves().length)return null;return {multipv:1,depth:Math.max(1,Number(depth)||1),scoreCp:chess.isCheckmate()?null:0,mate:chess.isCheckmate()?0:null,pv:[],bestmove:'',candidates:[],terminal:true}}catch(e){return null}}
    function isForcedPosition(fen){return legalMoves(fen).length===1}
    function isCaptureMove(move){var flags=String(move&&move.flags||'');return !!(move&&move.captured)||flags.indexOf('c')>=0||flags.indexOf('e')>=0}
    function materialExchangeMoveFact(fen,move){var u=moveUci(move),legal=legalMoves(fen).filter(function(candidate){return moveUci(candidate)===u})[0],from=u.slice(0,2),to=u.slice(2,4),flags=String(legal&&legal.flags||''),capture=isCaptureMove(legal),capturedSquare=capture&&flags.indexOf('e')>=0?to[0]+from[1]:to;return {uci:u,from:from,to:to,color:move&&move.color||legal&&legal.color||'',capture:capture,capturedSquare:capturedSquare}}
    function materialExchangeForMove(move,beforeFen,previousState){return advanceMaterialExchangeState(previousState,materialExchangeMoveFact(beforeFen,move),beforeFen)}
    function canLegallyCapture(fen,square){return legalMoves(fen).some(function(move){return move.to===square&&isCaptureMove(move)})}
    function pieceHasSafeEscape(fen,square){return legalMoves(fen).filter(function(move){return move.from===square}).some(function(move){var nextFen=applyMove(fen,moveUci(move));return !canLegallyCapture(nextFen,move.to)})}
    function crossBoardOfferHasEscapableDirectTarget(afterFen,movedSquare,offeredSquare){var after=parseFen(afterFen),moved=after.board[movedSquare],offered=after.board[offeredSquare];if(!moved||!offered)return false;var white=moved===moved.toUpperCase(),offeredValue=pieceValue(offered);return Object.keys(after.board).some(function(square){var target=after.board[square];return target&&(target===target.toUpperCase())!==white&&target.toLowerCase()!=='k'&&pieceValue(target)>offeredValue&&attacksSquare(after,movedSquare,square)&&pieceHasSafeEscape(afterFen,square)})}
    function materialNetLoss(before,next,white){return (material(before,white)-material(next,white))-(material(before,!white)-material(next,!white))}
    function bestMoveMaterialOpportunityForContext(moveColor,before,beforeFen,previousMove,previousMaterialExchange){var u=before&&before.bestmove||'',legal=legalMoves(beforeFen).filter(function(candidate){return moveUci(candidate)===u})[0],base=parseFen(beforeFen),flags=String(legal&&legal.flags||''),capture=isCaptureMove(legal),capturedSquare=capture&&flags.indexOf('e')>=0?legal.to[0]+legal.from[1]:legal&&legal.to||'',capturedPiece=capturedSquare&&base.board[capturedSquare]||'',bestMove={color:moveColor,uci:u,san:u?sanForMove(beforeFen,u):''},materialExchange=legal?materialExchangeForMove(bestMove,beforeFen,previousMaterialExchange):null,routineRecapture=!!(capture&&previousMove&&moveUci(previousMove).slice(2,4)===legal.to),captureFen=capture?applyMove(beforeFen,u):beforeFen,white=moveColor==='w',immediateGain=capture?-materialNetLoss(base,parseFen(captureFen),white):0,recaptureGains=capture?legalMoves(captureFen).filter(function(recovery){return recovery.to===legal.to&&isCaptureMove(recovery)}).map(function(recovery){return -materialNetLoss(base,parseFen(applyMove(captureFen,moveUci(recovery))),white)}):[];return cleanMaterialOpportunity({legal:!!legal,capture:capture,bestMove:u,bestMoveSan:bestMove.san,capturedPiece:capturedPiece,capturedValue:pieceValue(capturedPiece),immediateGain:immediateGain,recaptureGains:recaptureGains,inheritedExchange:!!(materialExchange&&materialExchange.inherited),routineRecapture:routineRecapture,poisonedCapture:!!legal&&poisonedCapture(base.board,legal),minimumGain:100})}
    // Unsafe, trapped and rescue ideas are adapted from the prose description
    // of WintrChess (GPL-3.0); this implementation contains no WintrChess code.
    function safetyValue(piece){return piece?({p:1,n:3,b:3,r:5,q:9,k:100}[piece.toLowerCase()]||0):0}
    function directRelations(pos,square,white){return Object.keys(pos.board).filter(function(from){var piece=pos.board[from];return from!==square&&(piece===piece.toUpperCase())===white&&attacksSquare(pos,from,square)})}
    function xrayRelationCount(pos,square,white){var directions=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]],sources={};directions.forEach(function(direction){var file=files.indexOf(square[0])+direction[0],rank=Number(square[1])+direction[1],front='',compatible=direction[0]&&direction[1]?'bq':'rq';while(file>=0&&file<8&&rank>=1&&rank<=8){var from=files[file]+rank,piece=pos.board[from];if(piece){if(!front){front=from;if((piece===piece.toUpperCase())!==white||compatible.indexOf(piece.toLowerCase())<0||!attacksSquare(pos,from,square))break}else{if((piece===piece.toUpperCase())===white&&compatible.indexOf(piece.toLowerCase())>=0)sources[from]=true;else break}}file+=direction[0];rank+=direction[1]}});return Object.keys(sources).length}
    function pieceUnsafe(pos,square,white,rookMinorCaptureSquare){var piece=pos.board[square];if(!piece||piece.toLowerCase()==='p'||piece.toLowerCase()==='k'||(piece===piece.toUpperCase())!==white)return false;var attackers=directRelations(pos,square,!white);if(!attackers.length)return false;var defenders=directRelations(pos,square,white),value=safetyValue(piece),cheapestAttacker=Math.min.apply(null,attackers.map(function(from){return safetyValue(pos.board[from])}));if(square===rookMinorCaptureSquare&&piece.toLowerCase()==='r'&&attackers.length===1&&safetyValue(pos.board[attackers[0]])===3&&defenders.length)return false;if(cheapestAttacker<value)return true;if(attackers.length+xrayRelationCount(pos,square,!white)<=defenders.length+xrayRelationCount(pos,square,white))return false;if(defenders.some(function(from){return pos.board[from].toLowerCase()==='p'}))return false;if(value<cheapestAttacker&&defenders.some(function(from){return safetyValue(pos.board[from])<cheapestAttacker}))return false;return true}
    function unsafePieces(fen,white,rookMinorCaptureSquare){var pos=parseFen(fen);return Object.keys(pos.board).filter(function(square){return pieceUnsafe(pos,square,white,rookMinorCaptureSquare)})}
    function hasSafePieceEscape(fen,square,white){var pos=parseFen(fen);pos.turn=white?'w':'b';pos.ep='-';var sideFen=toFen(pos);return legalMoves(sideFen).filter(function(move){return move.from===square}).some(function(move){var next=applyMove(sideFen,moveUci(move));return !pieceUnsafe(parseFen(next),move.to,white,'')})}
    function trappedUnsafePieces(fen,white,unsafe){return unsafe.filter(function(square){return !hasSafePieceEscape(fen,square,white)})}
    function sacrificeCaptureCandidates(m,beforeFen,afterFen,priorOwnBeforeFen,exchangeThreadBaselineFen){
      if(!m||!beforeFen||!afterFen||m.promotion||positionInCheck(beforeFen))return [];
      var white=m.color==='w',before=parseFen(beforeFen),after=parseFen(afterFen),movedSquare=moveUci(m).slice(2,4),fromSquare=moveUci(m).slice(0,2),capturedByMove=safetyValue(m.captured||before.board[movedSquare]),rookMinorCaptureSquare=after.board[movedSquare]&&after.board[movedSquare].toLowerCase()==='r'&&capturedByMove===3?movedSquare:'',beforeUnsafe=unsafePieces(beforeFen,white,''),afterUnsafe=unsafePieces(afterFen,white,rookMinorCaptureSquare),candidates=[],checking=/[+#]/.test(m.san||'');
      var beforeTrapped=trappedUnsafePieces(beforeFen,white,beforeUnsafe),afterTrapped=trappedUnsafePieces(afterFen,white,afterUnsafe),rescuedMover=beforeUnsafe.indexOf(fromSquare)>=0&&afterUnsafe.indexOf(movedSquare)<0,newHigherOffer=afterUnsafe.some(function(square){return beforeUnsafe.indexOf(square)<0&&safetyValue(after.board[square])>safetyValue(before.board[fromSquare])});
      var rescue=!checking&&(afterUnsafe.length<beforeUnsafe.length||rescuedMover&&!newHigherOffer),lostAnyway=beforeTrapped.indexOf(fromSquare)>=0||!!afterUnsafe.length&&afterTrapped.length===afterUnsafe.length||afterTrapped.length<beforeTrapped.length;
      var minOffer=minimumSacrificeOffer();
      legalMoves(afterFen).forEach(function(capture){
        if(!isCaptureMove(capture))return;
        var flags=String(capture.flags||''),capturedSquare=flags.indexOf('e')>=0?capture.to[0]+capture.from[1]:capture.to,target=after.board[capturedSquare],value=safetyValue(target);
        if(!target||target.toLowerCase()==='p'||target.toLowerCase()==='k'||value<=capturedByMove)return;
        var staticOffer=!rescue&&!lostAnyway&&afterUnsafe.indexOf(capturedSquare)>=0;
        // A rescue can be an illusion when the previously unsafe piece is
        // offered anyway and the mover declines an available equal recapture.
        var declinedRecapture=rescue&&beforeUnsafe.indexOf(capturedSquare)>=0&&afterUnsafe.indexOf(capturedSquare)<0;
        // A trapped piece may still start a forcing checking combination.
        var forcingCheck=lostAnyway&&beforeTrapped.indexOf(fromSquare)>=0&&capturedSquare===movedSquare&&isCaptureMove(m);
        if(!staticOffer&&!declinedRecapture&&!forcingCheck)return;
        var inheritedExchange=!!exchangeThreadBaselineFen&&capturedSquare===movedSquare,offerBaselineFen=inheritedExchange?exchangeThreadBaselineFen:beforeFen,offerBaseline=parseFen(offerBaselineFen),captureFen=applyMove(afterFen,moveUci(capture)),afterCapture=parseFen(captureFen),materialOffer=materialNetLoss(offerBaseline,afterCapture,white);
        if(materialOffer<minOffer)return;
        // The target itself bounds the offered stake. Lost-anyway is decided
        // by the unsafe/trapped board rule above, not a separate short search.
        var capturedValue=pieceValue(target),rawOffer=Math.min(materialOffer,capturedValue);
        if(rawOffer<minOffer)return;
        var replies=legalMoves(captureFen),directRecoveries=replies.filter(function(recovery){return recovery.to===capture.to&&isCaptureMove(recovery)}),recoveryUcis=directRecoveries.map(function(recovery){return moveUci(recovery)}),recoveryNetLosses=directRecoveries.map(function(recovery){return materialNetLoss(offerBaseline,parseFen(applyMove(captureFen,moveUci(recovery))),white)}),directRecoveryResidual=directRecoveryResidualOffer(rawOffer,recoveryNetLosses),equalRecaptureUcis=recoveryUcis.filter(function(uci,index){return recoveryNetLosses[index]<=0});
        var forcingReplies=replies.filter(function(reply){return positionInCheck(captureFen)||isCaptureMove(reply)||/[+#]/.test(reply.san||'')});
        var declineReplyUcis=declinedRecapture?forcingReplies.filter(function(reply){return materialNetLoss(offerBaseline,parseFen(applyMove(captureFen,moveUci(reply))),white)>=minOffer}).map(function(reply){return moveUci(reply)}):[];
        var forcingCheckUcis=forcingCheck?forcingReplies.filter(function(reply){return /[+#]/.test(reply.san||'')&&materialNetLoss(offerBaseline,parseFen(applyMove(captureFen,moveUci(reply))),white)>=minOffer}).map(function(reply){return moveUci(reply)}):[];
        if(declinedRecapture&&(!equalRecaptureUcis.length||!declineReplyUcis.length))declinedRecapture=false;
        if(forcingCheck&&!forcingCheckUcis.length)forcingCheck=false;
        var mode=staticOffer?'static':declinedRecapture?'declined-recapture':forcingCheck?'forcing-check':'';
        if(!mode)return;
        candidates.push({uci:moveUci(capture),capturedSquare:capturedSquare,capturedPiece:target,capturedValue:capturedValue,materialOffer:materialOffer,rawOffer:rawOffer,directRecoveryResidual:directRecoveryResidual,directRecoveryCount:recoveryNetLosses.length,directRecoveryUcis:recoveryUcis,offerBaselineFen:offerBaselineFen,materialThreadOrigin:inheritedExchange?'inherited-exchange':'created-offer',recoveryNetLosses:recoveryNetLosses,bestImmediateRecoveryNet:recoveryNetLosses.length?Math.min.apply(null,recoveryNetLosses):materialOffer,boardCounterplay:forcingCheckUcis,offerMode:mode,equalRecaptureUcis:equalRecaptureUcis,declineReplyUcis:declineReplyUcis,continuationOverBudget:mode==='declined-recapture'&&new Set(equalRecaptureUcis.concat(declineReplyUcis)).size>16});
      });
      return candidates
    }
    function sacrificeVerificationKey(afterFen,candidates){return engineKind+'|classifier45|board-offer-depth10|'+normalizedFen(afterFen)+'|'+(candidates||[]).map(function(candidate){return candidate.uci+':'+candidate.materialOffer+':'+String(candidate.offerBaselineFen||'')+':'+String(candidate.directRecoveryResidual||0)+':'+candidate.offerMode+':'+candidate.materialThreadOrigin+':'+candidate.rawOffer+':'+(candidate.boardCounterplay||[]).join('.')+':'+(candidate.equalRecaptureUcis||[]).join('.')+':'+(candidate.declineReplyUcis||[]).join('.')}).sort().join(',')}
    function sacrificeMaterialPath(beforeFen,afterFen,white,line){var before=parseFen(beforeFen),fen=afterFen;return ((line&&line.pv)||[]).slice(0,6).map(function(uci){fen=applyMove(fen,uci);return materialNetLoss(before,parseFen(fen),white)})}
    function lineUsesImmediateRecovery(afterFen,line){var pv=(line&&line.pv)||[],acceptedMove=pv[0]||'',recoveryUci=pv[1]||'';if(!acceptedMove||!recoveryUci)return false;var acceptedFen=applyMove(afterFen,acceptedMove),recovery=legalMoves(acceptedFen).filter(function(move){return moveUci(move)===recoveryUci})[0];return !!recovery&&isCaptureMove(recovery)&&recovery.to===acceptedMove.slice(2,4)}
    function buildSacrificeVerification(m,beforeFen,afterFen,candidates,line,source){
      var acceptedMove=((line&&line.pv)||[])[0]||'',offer=(candidates||[]).filter(function(candidate){return candidate.uci===acceptedMove})[0];
      if(!offer)return null;
      var favorableMate=line.mate!=null&&Number(line.mate)<0,rawQualifyingOffer=offer.rawOffer;
      var forcingCheckWitness=offer.offerMode==='forcing-check'&&(offer.boardCounterplay||[]).length>0&&favorableMate;
      var qualifyingOffer=offer.offerMode==='static'&&offer.directRecoveryResidual>=minimumSacrificeOffer()||forcingCheckWitness?rawQualifyingOffer:0;
      return {
        offerMode:offer.offerMode,declinedRecaptureWitness:false,forcingCheckWitness:forcingCheckWitness,
        continuationComplete:offer.offerMode!=='declined-recapture',
        continuationStatus:offer.offerMode==='declined-recapture'?(offer.continuationOverBudget?'over-budget':'pending'):'none',
        acceptanceLines:[],candidateScopeKey:sacrificeVerificationKey(afterFen,candidates),classifierVersion:CLASSIFIER_VERSION,
        source:source,depth:Math.max(1,Number(line.depth)||1),candidateUcis:candidates.map(function(candidate){return candidate.uci}),
        acceptedMove:acceptedMove,capturedSquare:offer.capturedSquare,capturedPiece:offer.capturedPiece,
        capturedValue:offer.capturedValue,materialOffer:offer.materialOffer,
        rawQualifyingMaterialOffer:rawQualifyingOffer,qualifyingMaterialOffer:qualifyingOffer,
        directRecoveryResidual:offer.directRecoveryResidual,directRecoveryCount:offer.directRecoveryCount,
        directRecoveryUcis:(offer.directRecoveryUcis||[]).slice(),offerBaselineFen:offer.offerBaselineFen||beforeFen,
        materialThreadOrigin:offer.materialThreadOrigin||'created-offer',favorableMate:favorableMate,
        scoreCp:line.scoreCp==null?null:Number(line.scoreCp),mate:line.mate==null?null:Number(line.mate),pv:(line.pv||[]).slice()
      }
    }
    function evaluateSacrificeLines(m,beforeFen,afterFen,candidates,lines,source,complete){var byUci={},verifications=(lines||[]).map(function(line){return buildSacrificeVerification(m,beforeFen,afterFen,candidates,line,source)}).filter(Boolean);verifications.forEach(function(verification){var prior=byUci[verification.acceptedMove];if(!prior||verification.depth>prior.depth)byUci[verification.acceptedMove]=verification});var completeLines=Object.keys(byUci).map(function(uci){return byUci[uci]}),covered=completeLines.length===candidates.length,qualifying=completeLines.filter(function(verification){return verification.qualifyingMaterialOffer>=minimumSacrificeOffer()})[0],selected=qualifying||completeLines.filter(function(verification){return verification.rawQualifyingMaterialOffer>=minimumSacrificeOffer()})[0]||completeLines[0]||null;if(selected){selected.coverageComplete=covered;selected.verifiedCandidateUcis=Object.keys(byUci).sort();selected.worstAcceptedEp=Math.min.apply(null,completeLines.map(function(verification){return expectedPoints(-numericScore(verification))}));selected.depth=Math.min.apply(null,completeLines.map(function(verification){return verification.depth}));selected.acceptanceLines=completeLines.map(function(verification){return {uci:verification.acceptedMove,depth:verification.depth,scoreCp:verification.scoreCp,mate:verification.mate,pv:verification.pv.slice()}});var pendingDecline=candidates.some(function(candidate){return candidate.offerMode==='declined-recapture'&&!candidate.continuationOverBudget}),overBudget=candidates.some(function(candidate){return candidate.offerMode==='declined-recapture'&&candidate.continuationOverBudget});selected.continuationComplete=selected.qualifyingMaterialOffer>=minimumSacrificeOffer()||!pendingDecline;selected.continuationStatus=selected.qualifyingMaterialOffer>=minimumSacrificeOffer()?'none':pendingDecline?'pending':overBudget?'over-budget':'none'}return {verification:selected,qualifying:!!qualifying,covered:covered,verifications:completeLines}}
    // Knight's Eye extension: compare a voluntary declined recapture with every
    // equal recapture in one exact post-acceptance search. No PV[1] choice decides
    // the offer; the board enumerates bounded forcing replies and the engine
    // supplies only their outcome values.
    function continuationRequests(context,state,verification){
      if(!verification||!verification.coverageComplete||verification.qualifyingMaterialOffer>=minimumSacrificeOffer()||verification.continuationComplete)return [];
      if(verification.candidateScopeKey!==sacrificeVerificationKey(context.afterFen,state.candidates))return [];
      return state.candidates.filter(function(candidate){return candidate.offerMode==='declined-recapture'&&!candidate.continuationOverBudget}).map(function(candidate){
        var roots=Array.from(new Set(candidate.equalRecaptureUcis.concat(candidate.declineReplyUcis))).sort();
        return {fen:applyMove(context.afterFen,candidate.uci),depth:verification.depth,rootMoves:roots,acceptanceUci:candidate.uci}
      }).filter(function(request){return request.rootMoves.length>0&&request.rootMoves.length<=16})
    }
    function validContinuationAnalysis(request,analysis,minimumDepth){
      if(!analysis||!Number.isSafeInteger(request.depth)||request.depth<1||!Array.isArray(analysis.candidates)||analysis.candidates.length!==request.rootMoves.length||!Number.isSafeInteger(analysis.depth)||analysis.depth<minimumDepth)return false;
      var seen={};
      for(var index=0;index<analysis.candidates.length;index++){
        var line=analysis.candidates[index],origin=line&&line.scoreProvenance;
        if(!line||line.multipv!==index+1||!Number.isSafeInteger(line.depth)||line.depth<minimumDepth||!Array.isArray(line.pv)||!line.pv.length||seen[line.pv[0]]||request.rootMoves.indexOf(line.pv[0])<0||!((line.scoreCp===null&&Number.isSafeInteger(line.mate)&&line.mate!==0)||(line.mate===null&&typeof line.scoreCp==='number'&&Number.isFinite(line.scoreCp)))||origin&&(origin.fen!==request.fen||origin.kind!=='root-search'&&origin.kind!=='reconciliation-root'))return false;
        try{var board=new window.ChessJs.Chess(request.fen);line.pv.forEach(function(uci){if(typeof uci!=='string'||!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci))throw new Error('Invalid continuation PV');board.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||'q'})})}catch(e){return false}
        seen[line.pv[0]]=true;
      }
      return request.rootMoves.every(function(root){return seen[root]})&&analysis.depth<=Math.min.apply(null,analysis.candidates.map(function(line){return line.depth}))&&analysis.bestmove===analysis.candidates[0].pv[0]&&analysis.scoreCp===analysis.candidates[0].scoreCp&&analysis.mate===analysis.candidates[0].mate
    }
    function verifyContinuations(context,state,verification,evidence){
      var requests=continuationRequests(context,state,verification),items=evidence||[];
      if(!requests.length)return verification;
      if(!Array.isArray(items)||items.length!==requests.length||!Array.isArray(verification.acceptanceLines))return null;
      var qualified=null,bestDeclineEp=-Infinity,bestRecaptureEp=-Infinity,allRoots=[];
      for(var index=0;index<requests.length;index++){
        var request=requests[index],item=items[index],candidate=state.candidates.filter(function(offer){return offer.uci===request.acceptanceUci})[0];
        if(!item||!item.request||item.request.fen!==request.fen||item.request.depth!==request.depth||item.request.acceptanceUci!==request.acceptanceUci||JSON.stringify(item.request.rootMoves)!==JSON.stringify(request.rootMoves)||!validContinuationAnalysis(request,item.analysis,request.depth))return null;
        var lines=item.analysis.candidates,recaptureLines=lines.filter(function(line){return candidate.equalRecaptureUcis.indexOf(line.pv[0])>=0}),declineLines=lines.filter(function(line){return candidate.declineReplyUcis.indexOf(line.pv[0])>=0});
        if(recaptureLines.length!==candidate.equalRecaptureUcis.length||declineLines.length!==candidate.declineReplyUcis.length)return null;
        var recaptureEp=Math.max.apply(null,recaptureLines.map(function(line){return expectedPoints(numericScore(line))})),declineEp=Math.max.apply(null,declineLines.map(function(line){return expectedPoints(numericScore(line))}));
        allRoots=allRoots.concat(request.rootMoves);bestDeclineEp=Math.max(bestDeclineEp,declineEp);bestRecaptureEp=Math.max(bestRecaptureEp,recaptureEp);
        if(declineEp>=notBadOutcomeLine()&&declineEp+brilliantEpLossLimit()>=recaptureEp){
          var acceptance=verification.acceptanceLines.filter(function(line){return line.uci===candidate.uci})[0];
          if(!acceptance)return null;
          var proof=buildSacrificeVerification(context.move,context.beforeFen,context.afterFen,state.candidates,acceptance,'searchmoves+continuation');
          if(!proof)return null;
          proof.qualifyingMaterialOffer=proof.rawQualifyingMaterialOffer;proof.declinedRecaptureWitness=true;proof.declineBestEp=declineEp;proof.recaptureBestEp=recaptureEp;proof.continuationRoots=request.rootMoves.slice();
          if(!qualified||declineEp>qualified.declineBestEp)qualified=proof;
        }
      }
      var result=Object.assign({},qualified||verification,{coverageComplete:verification.coverageComplete,verifiedCandidateUcis:verification.verifiedCandidateUcis.slice(),worstAcceptedEp:verification.worstAcceptedEp,depth:Math.min.apply(null,[verification.depth].concat(items.map(function(item){return item.analysis.depth}))),acceptanceLines:verification.acceptanceLines.map(function(line){return Object.assign({},line,{pv:line.pv.slice()})}),continuationComplete:true,continuationStatus:qualified?'qualified':'unsound',continuationRoots:allRoots});
      return result
    }
    function sacrificeVerificationState(m,beforeFen,afterFen,afterAnalysis,priorOwnBeforeFen,exchangeThreadBaselineFen){
      if(exchangeThreadBaselineFen==null){var previousMove=treePreviousMoveForFen(beforeFen),previousState=previousMove&&previousMove.analysis&&previousMove.analysis.material_exchange,materialExchange=materialExchangeForMove(m,beforeFen,previousState);exchangeThreadBaselineFen=materialExchange.inherited?materialExchange.originFen:''}
      var candidates=sacrificeCaptureCandidates(m,beforeFen,afterFen,priorOwnBeforeFen,exchangeThreadBaselineFen);
      if(!candidates.length)return {candidates:candidates,verification:null};
      var allowed={},key=sacrificeVerificationKey(afterFen,candidates);candidates.forEach(function(candidate){allowed[candidate.uci]=candidate});
      var lines=((afterAnalysis&&afterAnalysis.candidates)||[]).filter(function(line){return allowed[((line.pv||[])[0]||'')]}),verification=evaluateSacrificeLines(m,beforeFen,afterFen,candidates,lines,'multipv',false).verification;
      function matches(candidate){var offer=candidate&&allowed[candidate.acceptedMove];return !!offer&&Number(candidate.classifierVersion)===CLASSIFIER_VERSION&&candidate.offerBaselineFen===offer.offerBaselineFen&&candidate.candidateScopeKey===key&&candidate.coverageComplete&&Array.isArray(candidate.verifiedCandidateUcis)&&candidate.verifiedCandidateUcis.length===candidates.length}
      [afterAnalysis&&afterAnalysis.sacrificeVerification,sacrificeVerificationCache[key]].forEach(function(candidate){if(matches(candidate)&&(!verification||!verification.coverageComplete||candidate.continuationComplete&&!verification.continuationComplete||candidate.continuationComplete===verification.continuationComplete&&candidate.depth>verification.depth))verification=candidate});
      if(verification){sacrificeVerificationCache[key]=verification;if(afterAnalysis)afterAnalysis.sacrificeVerification=verification}
      return {candidates:candidates,verification:verification}
    }
    function isSoundSacrificeForMove(verification,afterEp,alternativeEp,qualityLoss,playedMateOnly){if(!verification||!verification.coverageComplete)return false;var minAfterEp=notBadOutcomeLine(),minOffer=minimumSacrificeOffer(),acceptedEp=Number(verification.worstAcceptedEp);return qualifiesAsSacrificeOffer({sound:qualityLoss<=brilliantEpLossLimit(),notBad:afterEp>=minAfterEp,notAlreadyWon:alternativeEp<.94||!!playedMateOnly,acceptedSound:Number.isFinite(acceptedEp)&&acceptedEp>=minAfterEp,materialOffer:verification.qualifyingMaterialOffer,minOffer:minOffer})}
    // Policy 43's Interesting tier has a separate tactical-payoff rule. Its PV
    // material path is computed only for that tier and is never part of a
    // Brilliant verification or reusable engine-evidence proof.
    function legacyInterestingPayoff(verification,afterFen,white,acceptedEp){
      var path=sacrificeMaterialPath(verification.offerBaselineFen,afterFen,white,verification);
      var threadPath=lineUsesImmediateRecovery(afterFen,verification)?path.slice(1):path;
      var windowPlies=4,conversionPlies=Math.max(windowPlies,threadPath.length),minimumConversionGain=50;
      return hasTacticalSacrificePayoff({
        favorableMate:verification.favorableMate,
        materialConversionGain:materialConversionGain(threadPath,conversionPlies),
        minimumConversionGain:minimumConversionGain,
        persistentMaterialOffer:enduringMaterialOffer(threadPath,windowPlies),
        minOffer:minimumSacrificeOffer(),acceptedEp:acceptedEp
      })
    }
    function isInterestingOfferForMove(verification,afterEp,bestEp,qualityLoss,brilliant,mateMove,matingLine,afterFen,white){
      if(!verification)return false;
      var minAfterEp=notBadOutcomeLine(),minOffer=minimumSacrificeOffer(),acceptedEp=expectedPoints(-numericScore(verification));
      // Evaluate all non-PV gates before the legacy Interesting-only payoff.
      if(mateMove||brilliant||qualityLoss<=brilliantEpLossLimit()||qualityLoss>interestingEpLossLimit()||afterEp<minAfterEp||!matingLine&&bestEp>=.94||acceptedEp<minAfterEp||verification.qualifyingMaterialOffer<minOffer)return false;
      var tacticalPayoff=legacyInterestingPayoff(verification,afterFen,white,acceptedEp);
      return qualifiesAsInterestingOffer({mateMove:mateMove,brilliant:brilliant,epLoss:qualityLoss,brilliantLossLimit:brilliantEpLossLimit(),interestingLossLimit:interestingEpLossLimit(),notBad:true,notAlreadyWon:true,acceptedSound:true,tacticalPayoff:tacticalPayoff,materialOffer:verification.qualifyingMaterialOffer,minOffer:minOffer})
    }
    function positionInCheck(fen){try{return new window.ChessJs.Chess(fen).inCheck()}catch(e){return false}}
    function routineTacticalConversion(beforeFen,afterFen,white,immediateGain,line){var pv=((line&&line.pv)||[]).slice(0,3),favorableMate=line&&line.mate!=null&&Number(line.mate)<0;if(favorableMate)return true;if(pv.length<3)return false;var before=parseFen(beforeFen),fen=afterFen;pv.forEach(function(uci){fen=applyMove(fen,uci)});var finalGain=Math.max(0,-materialNetLoss(before,parseFen(fen),white));return finalGain-Math.max(0,Number(immediateGain)||0)>=150}
    function isRoutineMoveForContext(m,previousMove,beforeFen,afterFen,afterAnalysis,onlyViable,critical,uniqueGap){var before=parseFen(beforeFen),after=parseFen(afterFen),to=moveUci(m).slice(2,4),captured=before.board[to],moved=after.board[to],rootLine=(((afterAnalysis||{}).candidates||[])[0]||{}),reply=((rootLine.pv||[])[0]||''),immediateRecapture=!!previousMove&&moveUci(previousMove).slice(2,4)===to&&!!captured,baseRoutine=immediateRecapture||(captured&&pieceValue(captured)<=100&&!/[+#]/.test(m.san))||(!!captured&&!!moved&&Math.abs(pieceValue(captured)-pieceValue(moved))<=30&&reply.slice(2,4)===to),pawnBreakthrough=!immediateRecapture&&!!captured&&pieceValue(captured)<=100&&isAdvancedTacticalPawn(after.board,to,m.color==='w'),tacticalConversion=baseRoutine&&routineTacticalConversion(beforeFen,afterFen,m.color==='w',pieceValue(captured),rootLine);return routineBlocksGreatMove(baseRoutine,onlyViable,uniqueGap,pawnBreakthrough,tacticalConversion)}
    function bestMoveSpecialForContext(moveColor,previousMove,before,beforeFen,bestEp,onlyViable,critical,uniqueGap,priorOwnBeforeFen,previousMaterialExchange){
      var u=before&&before.bestmove||'',san=u?sanForMove(beforeFen,u):'',evasion=positionInCheck(beforeFen);
      if(!u||evasion)return {qualifies:false,uci:u,san:san,evasion:evasion,reason:!u?'missing-best-move':'position-in-check'};
      var bestMove={color:moveColor,uci:u,san:san},materialExchange=materialExchangeForMove(bestMove,beforeFen,previousMaterialExchange),base=parseFen(beforeFen),afterFen=applyMove(beforeFen,u),after=parseFen(afterFen),to=u.slice(2,4),moved=after.board[to],captured=base.board[to],value=pieceValue(moved),gain=pieceValue(captured),rootLine=(((before||{}).candidates||[])[0]||{}),pv=(rootLine.pv||[]).slice(),line=pv[0]===u?pv.slice(1):pv,reply=line[0]||'',immediateRecapture=!!previousMove&&moveUci(previousMove).slice(2,4)===to&&!!captured,baseRoutine=immediateRecapture||(captured&&pieceValue(captured)<=100&&!/[+#]/.test(san))||(captured&&moved&&Math.abs(pieceValue(captured)-pieceValue(moved))<=30&&reply.slice(2,4)===to),white=moveColor==='w',pawnBreakthrough=!immediateRecapture&&!!captured&&gain<=100&&isAdvancedTacticalPawn(after.board,to,white),tacticalConversion=baseRoutine&&routineTacticalConversion(beforeFen,afterFen,white,gain,{mate:rootLine.mate==null?null:-Number(rootLine.mate),pv:line}),routine=routineBlocksGreatMove(baseRoutine,onlyViable,uniqueGap,pawnBreakthrough,tacticalConversion),sacrifice=false,forcesMate=before&&before.mate!=null&&Number(before.mate)>0,tactical=/[x+#]/.test(san),qualifies=qualifiesAsGreatMove({nearBest:true,afterEp:bestEp,minAfterEp:notBadOutcomeLine(),sacrifice:sacrifice,forcesMate:forcesMate,critical:critical,onlyViable:onlyViable,tactical:tactical,evasion:evasion,routine:routine});
      return {qualifies:qualifies,uci:u,san:san,evasion:evasion,baseRoutine:baseRoutine,routine:routine,routineOverride:baseRoutine&&!routine,pawnBreakthrough:pawnBreakthrough,tacticalConversion:tacticalConversion,uniqueGap:uniqueGap,sacrifice:sacrifice,forcesMate:forcesMate,tactical:tactical,onlyViable:onlyViable,critical:critical,captured:captured||'',capturedValue:gain,movedValue:value,capturedSoon:false,materialOffer:0,materialExchange:materialExchange,verification:null,minAfterEp:notBadOutcomeLine(),bestEp:bestEp}
    }
    function classifyAnalyzedMoveBase(context){
      var m=context.move,before=context.beforeAnalysis||{},after=context.afterAnalysis||{},beforeFen=context.beforeFen,afterFen=context.afterFen,previousMove=context.previousMove||null,previousMaterialExchange=context.previousMaterialExchange||null,materialExchange=materialExchangeForMove(m,beforeFen,previousMaterialExchange),exchangeBaselineFen=materialExchange.inherited?materialExchange.originFen:'',priorOwnBeforeFen=context.priorOwnBeforeFen||'',mateMove=/#/.test(m.san)||!!after.terminal&&after.mate===0,forced=isForcedPosition(beforeFen),beforeCp=numericScore(before),playedEvaluation=outcomeEvaluationForMove(m,before,after,mateMove),afterForMover=numericScore(playedEvaluation),loss=Math.max(0,Math.min(9999,beforeCp-afterForMover)),bestEp=evaluationOutcomeEp(before),afterEp=evaluationOutcomeEp(playedEvaluation),epLoss=Math.max(0,bestEp-afterEp),bestMate=before.mate==null?null:Number(before.mate),playedMate=playedEvaluation.mate==null?null:Number(playedEvaluation.mate),bestUtility=classificationUtility(bestEp,bestMate),playedUtility=classificationUtility(afterEp,playedMate),formatOnly=sameOutcomeFormatBand(bestEp,afterEp,bestMate,playedMate),qualityLoss=formatOnly?epLoss:mateAwareQualityLoss(bestUtility,playedUtility,bestMate,playedMate),playedBest=mateMove||moveUci(m)===(before.bestmove||'')&&(!after.terminal||epLoss<.002),mateDifference=mateDistanceDifference(bestMate,playedMate),nearBest=mateMove||playedBest||(mateDifference!=null&&mateDifference<=1)||qualityLoss<=brilliantEpLossLimit(),candidates=(before&&before.candidates)||[],second=candidates[1],secondEp=second?evaluationOutcomeEp(second):bestEp,alternative=candidates.filter(function(line){return ((line.pv||[])[0]||line.uci)!==moveUci(m)}).sort(function(a,b){return classificationUtility(evaluationOutcomeEp(b),b.mate==null?null:Number(b.mate))-classificationUtility(evaluationOutcomeEp(a),a.mate==null?null:Number(a.mate))})[0],alternativeEp=alternative?evaluationOutcomeEp(alternative):bestEp,playedMateOnly=!!alternative&&(playedMate!=null&&playedMate>0||playedMate==null&&after.mate!=null&&Number(after.mate)<0)&&!(alternative.mate!=null&&Number(alternative.mate)>0),secondMate=second&&second.mate!=null?Number(second.mate):null,secondUtility=second?classificationUtility(secondEp,secondMate):bestUtility,uniqueGap=Math.min(Math.max(0,sameOutcomeFormatBand(bestEp,secondEp,bestMate,secondMate)?bestEp-secondEp:bestUtility-secondUtility),!playedBest&&formatOnly?epLoss:Infinity),priorEp=context.priorEp==null?bestEp:Number(context.priorEp),critical=(priorEp<.38&&bestEp>=.45)||(priorEp<.62&&bestEp>=.72),onlyViable=isOnlyViableMove(uniqueGap,0),forcesMate=playedMate!=null&&playedMate>0&&(bestMate==null||bestMate<=0),newlyAllowsMate=!formatOnly&&playedMate!=null&&playedMate<0&&(bestMate==null||bestMate>=0),matingLine=bestMate!=null&&bestMate>1&&playedMate!=null&&playedMate>0,missedImmediateMate=bestMate===1&&playedMate!==1&&verifiedMateInOne(context),abandonedForcedMate=!formatOnly&&bestMate!=null&&bestMate>1&&!(playedMate!=null&&playedMate>0),mateLossClassification=classifyMissedMate({missedImmediateMate:missedImmediateMate,abandonedForcedMate:abandonedForcedMate,afterEp:afterEp,winningLine:winningOutcomeLine(),notBadLine:notBadOutcomeLine()}),verificationState=sacrificeVerificationState(m,beforeFen,afterFen,after,priorOwnBeforeFen,exchangeBaselineFen),sacrificeVerification=verificationState.verification,sacrifice=nearBest&&isSoundSacrificeForMove(sacrificeVerification,afterEp,alternativeEp,qualityLoss,playedMateOnly),interestingMove=isInterestingOfferForMove(sacrificeVerification,afterEp,bestEp,qualityLoss,sacrifice,mateMove,matingLine,afterFen,m.color==='w'),evasion=positionInCheck(beforeFen),routine=isRoutineMoveForContext(m,previousMove,beforeFen,afterFen,after,onlyViable,critical,uniqueGap),tactical=/[x+#]/.test(m.san),greatMove=qualifiesAsGreatMove({mateMove:mateMove,nearBest:nearBest,afterEp:afterEp,minAfterEp:notBadOutcomeLine(),sacrifice:sacrifice,forcesMate:forcesMate,critical:critical,onlyViable:onlyViable,tactical:tactical,evasion:evasion,routine:routine}),bestSpecial=bestMoveSpecialForContext(m.color,previousMove,before,beforeFen,bestEp,onlyViable,critical,uniqueGap,priorOwnBeforeFen,previousMaterialExchange),missedSpecial=!nearBest&&bestSpecial.qualifies,classification=classifyFromSignals({forced:forced,book:!!context.book,greatMove:greatMove,sacrifice:sacrifice,interestingMove:interestingMove,playedBest:playedBest,epLoss:qualityLoss,qualityLoss:qualityLoss,outcomeEpLoss:epLoss,mateMove:mateMove,missedSpecial:missedSpecial,newlyAllowsMate:newlyAllowsMate,mateLossClassification:mateLossClassification,missedImmediateMate:missedImmediateMate,abandonedForcedMate:abandonedForcedMate,afterEp:afterEp,winningLine:winningOutcomeLine(),notBadLine:notBadOutcomeLine()});
      return {classification:classification,beforeCp:beforeCp,afterForMover:afterForMover,loss:loss,bestEp:bestEp,afterEp:afterEp,epLoss:epLoss,qualityLoss:qualityLoss,bestUtility:bestUtility,playedUtility:playedUtility,bestMate:bestMate,playedMate:playedMate,mateDifference:mateDifference,playedBest:playedBest,nearBest:nearBest,candidates:candidates,second:second,secondEp:secondEp,alternativeEp:alternativeEp,playedMateOnly:playedMateOnly,secondUtility:secondUtility,uniqueGap:uniqueGap,priorEp:priorEp,critical:critical,onlyViable:onlyViable,forced:forced,evasion:evasion,routine:routine,tactical:tactical,materialExchange:materialExchange,sacrifice:sacrifice,interestingMove:interestingMove,sacrificeCandidates:verificationState.candidates,sacrificeVerification:sacrificeVerification,forcesMate:forcesMate,newlyAllowsMate:newlyAllowsMate,matingLine:matingLine,missedImmediateMate:missedImmediateMate,abandonedForcedMate:abandonedForcedMate,mateLossClassification:mateLossClassification,greatMove:greatMove,missedSpecial:missedSpecial,bestSpecial:bestSpecial,mateMove:mateMove}
    }
    function classifyAnalyzedMove(context){var decision=applyClassificationComparison(classifyAnalyzedMoveBase(context),context),bestMaterialOpportunity=bestMoveMaterialOpportunityForContext(context.move.color,context.beforeAnalysis||{},context.beforeFen,context.previousMove||null,context.previousMaterialExchange||null),missedMaterialOpportunity=!decision.nearBest&&bestMaterialOpportunity.qualifies,missedOpportunity=decision.missedSpecial||missedMaterialOpportunity;decision.bestMaterialOpportunity=bestMaterialOpportunity;decision.missedMaterialOpportunity=missedMaterialOpportunity;decision.missedOpportunity=missedOpportunity;decision.missedOpportunityDiagnostic=missedMaterialOpportunity?Object.assign({},bestMaterialOpportunity,{outcomeLoss:decision.epLoss}):null;decision.classification=classifyFromSignals({forced:decision.forced,book:!!context.book,greatMove:decision.greatMove,sacrifice:decision.sacrifice,interestingMove:decision.interestingMove,playedBest:decision.playedBest,qualityLoss:decision.qualityLoss,outcomeEpLoss:decision.epLoss,mateMove:decision.mateMove,missedOpportunity:missedOpportunity,missedSpecial:decision.missedSpecial,missedMaterialOpportunity:missedMaterialOpportunity,newlyAllowsMate:decision.newlyAllowsMate,mateLossClassification:decision.mateLossClassification,missedImmediateMate:decision.missedImmediateMate,abandonedForcedMate:decision.abandonedForcedMate,afterEp:decision.afterEp,winningLine:winningOutcomeLine(),notBadLine:notBadOutcomeLine()});return decision}

// END COMPATIBILITY REGION ANALYSIS_CORE_SOURCE

  // The reusable orchestrator may select stronger evidence than the historical
  // MultiPV-first resolver. Scope that choice to this synchronous classification;
  // retain the original candidate lines for routine-move and tactical PV checks.
  const historicalSacrificeVerificationState = sacrificeVerificationState;
  let selectedClassificationEvidence = null;
  // Decorate the historical binding without changing compatibility bytes.
  sacrificeVerificationState = function(m, beforeFen, afterFen, afterAnalysis, priorOwnBeforeFen, exchangeThreadBaselineFen) {
    const selected = selectedClassificationEvidence;
    if (!selected || selected.context.move !== m || selected.context.beforeFen !== beforeFen || selected.context.afterFen !== afterFen || selected.context.afterAnalysis !== afterAnalysis) {
      return historicalSacrificeVerificationState(m, beforeFen, afterFen, afterAnalysis, priorOwnBeforeFen, exchangeThreadBaselineFen);
    }
    const candidates = sacrificeCaptureCandidates(m, beforeFen, afterFen, priorOwnBeforeFen, exchangeThreadBaselineFen);
    const verification = selected.verification;
    const offer = candidates.find(candidate => candidate.uci === verification.acceptedMove);
    const key = sacrificeVerificationKey(afterFen, candidates);
    if (Number(verification.classifierVersion) !== CLASSIFIER_VERSION || !offer || verification.offerBaselineFen !== offer.offerBaselineFen || verification.candidateScopeKey !== key) {
      throw new TypeError('Selected sacrifice verification does not match the classified move context.');
    }
    return { candidates, verification };
  };

  function classifyWithSelectedVerification(context, selectedVerification) {
    if (selectedVerification == null) return classifyAnalyzedMove(context);
    const previous = selectedClassificationEvidence;
    selectedClassificationEvidence = { context, verification: selectedVerification };
    try { return classifyAnalyzedMove(context); }
    finally { selectedClassificationEvidence = previous; }
  }

  return {
    resetEvidence: function() { sacrificeVerificationCache = preparedCache(preparedCaches.sacrificeVerification); },
    terminal: terminalPositionResult,
    legalCount: function(fen) { return legalMoves(fen).length; },
    exchange: function(context) { return materialExchangeForMove(context.move, context.beforeFen, context.previousMaterialExchange); },
    offer: function(context, after, baseline) { return sacrificeVerificationState(context.move, context.beforeFen, context.afterFen, after, context.priorOwnBeforeFen, baseline); },
    verify: function(context, state, lines) { return evaluateSacrificeLines(context.move, context.beforeFen, context.afterFen, state.candidates, lines, 'searchmoves', true).verification; },
    continuationRequests, verifyContinuations,
    classify: classifyWithSelectedVerification,
    classificationComparison, admitClassificationComparison,
    classifyPrepared: classifyAnalyzedMove,
    // These operations consume host-prepared context. They do not admit engine
    // evidence or claim a complete acquired/supplied analysis outcome.
    prepared: {
      // A consistency operation over recorded inputs, not an evidence admission.
      // Reuse the native label selector and its current mate-policy defaults.
      classifyRecordedSignals: function(signal) {
        return classifyFromSignals(Object.assign({}, signal, {
          winningLine: winningOutcomeLine(), notBadLine: notBadOutcomeLine(),
        }));
      },
      classificationComparison, admitClassificationComparison,
      numericScore, expectedPoints, notBadOutcomeLine, pieceValue, legalMoves,
      terminalPositionResult, materialExchangeForMove, canLegallyCapture,
      unsafePieces, trappedUnsafePieces,
      sacrificeCaptureCandidates, sacrificeVerificationKey, evaluateSacrificeLines,
      sacrificeVerificationState: historicalSacrificeVerificationState,
      continuationRequests, verifyContinuations,
      classifyAnalyzedMove,
    },
    priorPoints: function(position) { return expectedPoints(-numericScore(position)); },
    materialExchangeForMove: materialExchangeForMove,
  };
}
