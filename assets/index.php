<?php
session_start();
if (!isset($_SESSION['score']))     $_SESSION['score'] = 0;
if (!isset($_SESSION['completed'])) $_SESSION['completed'] = [];
if (!isset($_SESSION['artifacts'])) $_SESSION['artifacts'] = [];
if (!isset($_SESSION['mgWon']))     $_SESSION['mgWon'] = false;
if (!isset($_SESSION['comfort']))   $_SESSION['comfort'] = [];

$LAYERS = [
  'base' => [
    'label' => '1-й слой · Базовый (термобельё)',
    'role'  => 'Отводит пот от кожи',
    'items' => [
      'cotton'    => ['name'=>'Хлопок','icon'=>'🌿','type'=>'Натуральное','clo'=>0.20,'breath'=>7,'wetSens'=>0.50,'uv'=>6,'waterproof'=>0,'windproof'=>0,'desc'=>'Дышит, но мокнет и перестаёт греть.'],
      'polyester' => ['name'=>'Полиэстер','icon'=>'🧪','type'=>'Синтетика','clo'=>0.15,'breath'=>8,'wetSens'=>0.10,'uv'=>3,'waterproof'=>0,'windproof'=>0,'desc'=>'Отводит влагу, быстро сохнет.'],
      'merino'    => ['name'=>'Шерсть мериноса','icon'=>'🐑','type'=>'Натуральное','clo'=>0.60,'breath'=>6,'wetSens'=>0.30,'uv'=>5,'waterproof'=>0,'windproof'=>0,'desc'=>'Греет даже влажной. Классика севера.'],
      'linen'     => ['name'=>'Лён','icon'=>'🌾','type'=>'Натуральное','clo'=>0.10,'breath'=>9,'wetSens'=>0.15,'uv'=>9,'waterproof'=>0,'windproof'=>0,'desc'=>'Охлаждает и защищает от солнца.'],
    ]
  ],
  'mid' => [
    'label' => '2-й слой · Утеплитель',
    'role'  => 'Сохраняет тепло',
    'items' => [
      'none'        => ['name'=>'Без утеплителя','icon'=>'➖','type'=>'—','clo'=>0,'breath'=>10,'wetSens'=>0,'uv'=>5,'waterproof'=>0,'windproof'=>0,'desc'=>'Ничего лишнего. Для жары.'],
      'fleece'      => ['name'=>'Флис','icon'=>'🧶','type'=>'Синтетика','clo'=>1.50,'breath'=>7,'wetSens'=>0.30,'uv'=>4,'waterproof'=>0,'windproof'=>0,'desc'=>'Лёгкое тепло, не боится влаги.'],
      'down'        => ['name'=>'Пух','icon'=>'🪶','type'=>'Натуральное','clo'=>4.00,'breath'=>3,'wetSens'=>1.00,'uv'=>4,'waterproof'=>0,'windproof'=>0,'desc'=>'Максимум тепла, но боится влаги.'],
      'linen_shirt' => ['name'=>'Льняная рубашка','icon'=>'👕','type'=>'Натуральное','clo'=>0.20,'breath'=>9,'wetSens'=>0.15,'uv'=>8,'waterproof'=>0,'windproof'=>0,'desc'=>'Дышащая прослойка для жары.'],
    ]
  ],
  'outer' => [
    'label' => '3-й слой · Защита',
    'role'  => 'Ветер, дождь, солнце',
    'items' => [
      'none'        => ['name'=>'Без верхнего слоя','icon'=>'➖','type'=>'—','clo'=>0,'breath'=>10,'wetSens'=>0,'uv'=>5,'waterproof'=>0,'windproof'=>0,'desc'=>'Открыт всем ветрам.'],
      'membrane'    => ['name'=>'Мембрана','icon'=>'🛡️','type'=>'High-tech','clo'=>0.30,'breath'=>9,'wetSens'=>0.10,'uv'=>4,'waterproof'=>9,'windproof'=>9,'desc'=>'Пар пропускает — воду нет.'],
      'pvc'         => ['name'=>'Дождевик-пакет','icon'=>'🛍️','type'=>'Плёнка','clo'=>0.10,'breath'=>0,'wetSens'=>0.10,'uv'=>3,'waterproof'=>10,'windproof'=>9,'desc'=>'Не промокает, но «эффект бани».'],
      'softshell'   => ['name'=>'Softshell','icon'=>'🧥','type'=>'Синтетика','clo'=>0.35,'breath'=>7,'wetSens'=>0.20,'uv'=>5,'waterproof'=>5,'windproof'=>8,'desc'=>'Демисезон: ветер и морось.'],
      'windbreaker' => ['name'=>'Ветровка','icon'=>'🎏','type'=>'Синтетика','clo'=>0.10,'breath'=>5,'wetSens'=>0.20,'uv'=>4,'waterproof'=>2,'windproof'=>6,'desc'=>'Лёгкая защита от ветра.'],
    ]
  ],
];

$LEGENDARY = [
  'silk'     => ['name'=>'Шёлк','icon'=>'🧵','need'=>1,'clo'=>0.40,'breath'=>10,'wetSens'=>0.15,'uv'=>7,'desc'=>'Древний китайский секрет. Лёгкий, прочный, дышит лучше хлопка. Не теряет тепло при намокании.'],
  'spider'   => ['name'=>'Паучий шёлк','icon'=>'🕷️','need'=>2,'clo'=>2.00,'breath'=>8,'wetSens'=>0.20,'uv'=>6,'desc'=>'В 5 раз прочнее стали. Ткань будущего — тепло как шерсть, но втрое тоньше.'],
  'aerogel'  => ['name'=>'Аэрогель','icon'=>'❄️','need'=>3,'clo'=>6.00,'breath'=>5,'wetSens'=>0.05,'uv'=>5,'desc'=>'«Застывший дым» — 99% воздуха. Лучший теплоизолятор на Земле.'],
  'graphene' => ['name'=>'Графен','icon'=>'⚡','need'=>4,'clo'=>1.50,'breath'=>10,'wetSens'=>0.02,'uv'=>10,'desc'=>'Один атом углерода. Прочнее алмаза, паропроницаем и водонепроницаем. Материал XXII века.'],
];

$ZONES = [
  ['id'=>0,'name'=>'База «Патруль»','x1'=>-600,'x2'=>600,'temp'=>22,'wind'=>0,'rain'=>0,'sun'=>0,'weather'=>'none',
   'sky1'=>'#faf3e8','sky2'=>'#f5e0c0','ground'=>'#e8d0a8','groundTop'=>'#f5e0c0','decor'=>'base'],
  ['id'=>1,'name'=>'Якутская зима','x1'=>600,'x2'=>2300,'temp'=>-50,'wind'=>5,'rain'=>0,'sun'=>0,'weather'=>'snow',
   'sky1'=>'#e8ecf5','sky2'=>'#c8d0e8','ground'=>'#f0f0f8','groundTop'=>'#fafaff','decor'=>'snow'],
  ['id'=>2,'name'=>'Муссоны Вьетнама','x1'=>2300,'x2'=>4000,'temp'=>25,'wind'=>2,'rain'=>20,'sun'=>3,'weather'=>'rain',
   'sky1'=>'#e0ecdc','sky2'=>'#b8d0b0','ground'=>'#a8c098','groundTop'=>'#c0d4b0','decor'=>'vietnam'],
  ['id'=>3,'name'=>'Туманный Лондон','x1'=>4000,'x2'=>5700,'temp'=>10,'wind'=>6,'rain'=>2,'sun'=>1,'weather'=>'fog',
   'sky1'=>'#f0ece0','sky2'=>'#d0c8b8','ground'=>'#c8b8a0','groundTop'=>'#dcd0b8','decor'=>'london'],
  ['id'=>4,'name'=>'Пустыня Сахара','x1'=>5700,'x2'=>7400,'temp'=>45,'wind'=>3,'rain'=>0,'sun'=>11,'weather'=>'sand',
   'sky1'=>'#faf0d8','sky2'=>'#f5c890','ground'=>'#e8c898','groundTop'=>'#f0d8a8','decor'=>'sahara'],
];

$NPCS = [
  1 => ['name'=>'Доктор Айсен','role'=>'Гляциолог','avatar'=>'👨‍🔬','skin'=>'#f0d0b0','hair'=>'#6a4a30','clothes'=>'#C059FF','hairStyle'=>'short',
        'task'=>'Сфотографировать мамонтёнка в вечной мерзлоте',
        'greeting'=>'Ох, стажёр! Мне нужно добраться до ледника, но при −50°C обычная куртка превратится в лёд. Помоги собрать экипировку!',
        'thanks'=>'Спасибо! Ты настоящий метео-агент!','hint'=>'3 слоя: меринос → пух → мембрана, которая не дубеет.',
        'artifact'=>'❄️ Кристалл вечной мерзлоты'],
  2 => ['name'=>'Монах Линь','role'=>'Хранитель храма','avatar'=>'🧘','skin'=>'#f0d0b0','hair'=>'#3a2a1a','clothes'=>'#C059FF','hairStyle'=>'bald',
        'task'=>'Дойти до древнего храма сквозь муссон',
        'greeting'=>'Ливень заливает тропу. В дождевике я запарюсь, без него — промокну. Что делать?',
        'thanks'=>'Путь открыт! Благодарю, юный друг.','hint'=>'Лёгкая мембрана с высокой паропроницаемостью.',
        'artifact'=>'💧 Капля муссона'],
  3 => ['name'=>'Профессор Ватсон','role'=>'Климатолог','avatar'=>'🧑‍🏫','skin'=>'#f5e0c8','hair'=>'#b8a888','clothes'=>'#C059FF','hairStyle'=>'short',
        'task'=>'Провести замеры климата в парке',
        'greeting'=>'Добрый день! Морось и ветер, промозгло. Мне бы что-то демисезонное…',
        'thanks'=>'Отличные данные! Вы настоящий профессионал.','hint'=>'Демисезонный Softshell — то, что нужно.',
        'artifact'=>'🌫️ Лондонский туман'],
  4 => ['name'=>'Исследовательница Ясмин','role'=>'Археолог','avatar'=>'👩‍🦱','skin'=>'#e8c0a0','hair'=>'#4a2a1a','clothes'=>'#C059FF','hairStyle'=>'long',
        'task'=>'Найти потерянную экспедицию в песках',
        'greeting'=>'Солнце печёт безжалостно! Одежда превратилась в печку. Нужна защита от UV и лёгкие ткани.',
        'thanks'=>'Ты спас мне жизнь! Вот награда.','hint'=>'Свободный лён и UV-защита.',
        'artifact'=>'☀️ Солнечный амулет'],
];

$PATTERNS = [
  'solid'   => ['name'=>'Однотонный','icon'=>'⬛'],
  'stripes' => ['name'=>'Полоски','icon'=>'📏'],
  'dots'    => ['name'=>'Горошек','icon'=>'🔵'],
  'stars'   => ['name'=>'Звёзды','icon'=>'⭐'],
  'camo'    => ['name'=>'Камуфляж','icon'=>'🌿'],
  'grid'    => ['name'=>'Клетка','icon'=>'▦'],
];

$COLORS = ['#C059FF','#9b30eb','#e8b0b8','#f5d0a8','#b8c8a8','#a8c8e8','#c8b8e0','#f0e0a0','#e8d8c0','#d8c0a8'];

function h($s){ return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }
?>
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<title>🌍 Метео-Агент: Формула Комфорта</title>
<link rel="stylesheet" href="assets/style.css">
</head>
<body>

<div id="screens">

  <section id="screen-start" class="screen active">
    <div class="bg-anim bg-start"></div>
    <div class="screen-content center">
      <div class="logo-wrap"><canvas id="logoCanvas" width="220" height="250"></canvas></div>
      <div class="org-tag">Секретная организация</div>
      <h1 class="game-title">МЕТЕО-АГЕНТ</h1>
      <h2 class="game-subtitle">Формула Комфорта</h2>
      <div class="story-box">
        На Земле произошёл сбой «Климатического стабилизатора». Погода стала
        непредсказуемой. Ты — <b>стажёр климатического патруля</b>. Отправляйся
        в разные страны, помогай учёным и подбирай им идеальную экипировку
        по правилу трёх слоёв.
      </div>
      <div class="start-buttons">
        <button class="btn btn-primary btn-lg" id="startBtn">
          <span class="btn-icon">▶</span> Начать службу
        </button>
        <button class="btn btn-ghost btn-lg" id="aboutBtn">
          <span class="btn-icon">ℹ️</span> О разработчиках
        </button>
      </div>
      <div class="controls-hint">
        <div><kbd>←</kbd><kbd>→</kbd> / <kbd>A</kbd><kbd>D</kbd> — идти</div>
        <div><kbd>Space</kbd> — прыжок</div>
        <div><kbd>E</kbd> — поговорить</div>
        <div><kbd>L</kbd> — лаборатория</div>
        <div><kbd>B</kbd> — энциклопедия</div>
      </div>
    </div>
  </section>

  <section id="screen-about" class="screen">
    <div class="bg-anim bg-start"></div>
    <div class="screen-content center">
      <div class="about-card">
        <h2 class="about-title">ℹ️ О разработчиках</h2>
        <div class="about-list">
          <div class="about-item">
            <div class="about-role">Менеджер</div>
            <div class="about-name">Иван Иванович</div>
          </div>
          <div class="about-item">
            <div class="about-role">Дизайнер</div>
            <div class="about-name">Иван Иванович</div>
          </div>
          <div class="about-item">
            <div class="about-role">Разработчик</div>
            <div class="about-name">Иван Иванович</div>
          </div>
        </div>
        <div class="about-footer">
          🌍 Метео-Агент: Формула Комфорта<br>
          <small>Образовательная игра о выборе одежды по погоде</small>
        </div>
        <button class="btn btn-primary" data-close="about" style="margin-top:24px">← Назад</button>
      </div>
    </div>
  </section>

  <section id="screen-world" class="screen">
    <canvas id="game"></canvas>

    <div class="hud" id="hud">
      <div class="hud-panel">
        <div class="zone-name" id="zoneName">База «Патруль»</div>
        <div class="zone-meta" id="zoneMeta">🌡 +22°C</div>
      </div>
      <div class="badge" id="scoreBadge">⭐ 0 · 🏆 0/4 · 📖 0/4</div>
      <div class="hud-buttons">
        <button class="btn btn-icon" id="labBtn" title="Лаборатория (L)">🔬</button>
        <button class="btn btn-icon" id="encycloBtn" title="Энциклопедия (B)">📖</button>
        <button class="btn btn-icon" id="musicBtn" title="Музыка">🔊</button>
      </div>
      <div class="hud-bars">
        <div class="bar-wrap">
          <div class="bar-label"><span>❤️ Тепло</span><b id="warmVal">100%</b></div>
          <div class="bar warm"><i id="warmBar" style="width:100%"></i></div>
        </div>
        <div class="bar-wrap">
          <div class="bar-label"><span>💧 Сухость</span><b id="dryVal">100%</b></div>
          <div class="bar dry"><i id="dryBar" style="width:100%"></i></div>
        </div>
      </div>
    </div>

    <div class="controls-bar">
      <span><kbd>←</kbd><kbd>→</kbd> идти</span>
      <span><kbd>Space</kbd> прыжок</span>
      <span><kbd>E</kbd> поговорить</span>
      <span><kbd>L</kbd> 🔬</span>
      <span><kbd>B</kbd> 📖</span>
    </div>

    <div class="prompt" id="prompt">💬 Нажми <kbd>E</kbd> чтобы поговорить</div>

    <div class="dialogue" id="dialogue">
      <div class="dlg-head">
        <div class="dlg-ava" id="dlgAva">👨‍🔬</div>
        <div>
          <div class="dlg-name" id="dlgName"></div>
          <div class="dlg-role" id="dlgRole"></div>
        </div>
      </div>
      <div class="dlg-text" id="dlgText"></div>
      <div class="dlg-actions">
        <button class="btn btn-ghost" id="dlgDecline">Позже</button>
        <button class="btn btn-primary" id="dlgAccept">Принять миссию</button>
      </div>
    </div>
  </section>

  <section id="screen-lab" class="screen">
    <div class="bg-anim bg-lab"></div>
    <div class="screen-content">
      <header class="screen-head">
        <h2>🔬 Лаборатория материалов</h2>
        <button class="btn btn-ghost" data-close="lab">Закрыть (Esc)</button>
      </header>

      <nav class="tabs">
        <button class="tab active" data-tab="ref">📚 Справочник тканей</button>
        <button class="tab" data-tab="mg">🎮 Мини-игра «Мембрана»</button>
      </nav>

      <div id="lab-ref" class="tab-panel active">
        <p class="lab-intro">
          💡 Изучи свойства тканей.
          <span class="dot natural"></span> Натуральные —
          <span class="dot synthetic"></span> Синтетика —
          <span class="dot hitech"></span> High-tech.
        </p>
        <?php foreach ($LAYERS as $layer): ?>
          <div class="layer-section">
            <h3><?= h($layer['label']) ?> <span class="dim">— <?= h($layer['role']) ?></span></h3>
            <div class="grid-cards">
              <?php foreach ($layer['items'] as $item):
                $cls = 'neutral';
                if ($item['type']==='Натуральное') $cls='natural';
                elseif ($item['type']==='Синтетика') $cls='synthetic';
                elseif ($item['type']==='High-tech') $cls='hitech';
                elseif ($item['type']==='Плёнка') $cls='film';
              ?>
                <div class="mat-card <?= $cls ?>">
                  <div class="type"><?= h($item['type']) ?></div>
                  <div class="ic"><?= $item['icon'] ?></div>
                  <div class="nm"><?= h($item['name']) ?></div>
                  <div class="desc"><?= h($item['desc']) ?></div>
                  <div class="props">
                    <span class="prop">🔥 <b><?= $item['clo'] ?></b></span>
                    <span class="prop">💨 <b><?= $item['breath'] ?></b></span>
                    <span class="prop">💧 <b><?= $item['waterproof'] ?></b></span>
                    <span class="prop">🌬 <b><?= $item['windproof'] ?></b></span>
                    <span class="prop">☀️ <b><?= $item['uv'] ?></b></span>
                  </div>
                </div>
              <?php endforeach; ?>
            </div>
          </div>
        <?php endforeach; ?>
      </div>

      <div id="lab-mg" class="tab-panel">
        <div class="mg-wrap">
          <h3>🎮 «Пропусти пар, останови каплю»</h3>
          <p class="mg-intro">
            Мембрана — это сито. Поры должны быть <b>больше</b> молекул пара,
            но <b>меньше</b> капель воды. Настрой идеальный размер!
          </p>
          <canvas id="mgCanvas" width="720" height="320"></canvas>
          <div class="mg-controls">
            <label>Размер пор: <b id="mgPoreVal">50</b> нм</label>
            <input type="range" id="mgPore" min="5" max="100" value="50">
          </div>
          <div class="mg-counters">
            <div class="mg-counter">☁️ Пар прошёл<b id="mgPass">0</b></div>
            <div class="mg-counter">🚫 Пар застрял<b id="mgBlock">0</b></div>
            <div class="mg-counter">💧 Вода прошла<b id="mgLeak">0</b></div>
            <div class="mg-counter">🛡 Вода отбита<b id="mgStop">0</b></div>
          </div>
          <div class="mg-verdict" id="mgVerdict"></div>
          <button class="btn btn-ghost" id="mgReset" style="margin-top:14px">🔄 Сбросить</button>
        </div>
      </div>
    </div>
  </section>

  <section id="screen-wardrobe" class="screen">
    <div class="bg-anim bg-wardrobe"></div>
    <div class="screen-content">
      <header class="screen-head">
        <h2>👕 Гардероб</h2>
        <div class="w-task" id="wTask"></div>
        <button class="btn btn-ghost" data-close="wardrobe">Закрыть</button>
      </header>

      <div class="w-layout">
        <aside class="w-preview">
          <div class="w-who" id="wWho"></div>
          <canvas id="previewCanvas" width="240" height="290"></canvas>
          <div class="hint-box" id="wHint"></div>
        </aside>

        <div class="w-panel">
          <div class="editor-block">
            <h4>🎨 Цвет костюма</h4>
            <div class="color-row" id="colorRow"></div>
          </div>
          <div class="editor-block">
            <h4>🧵 Принт</h4>
            <div class="pattern-row" id="patternRow"></div>
          </div>
          <div id="layerBlocks"></div>
        </div>
      </div>

      <div class="w-actions">
        <button class="btn btn-primary btn-lg" id="launchMission">🚀 Запустить миссию</button>
      </div>
    </div>
  </section>

  <section id="screen-mission" class="screen">
    <div class="bg-anim bg-mission"></div>
    <div class="screen-content center">
      <h2 id="mTitle" class="mission-title"></h2>
      <div class="mission-sub" id="mSub"></div>

      <div class="mission-canvas-wrap">
        <canvas id="missionCanvas" width="900" height="440"></canvas>
        <div class="mission-vignette"></div>
      </div>

      <div class="mission-bars">
        <div class="bar-wrap">
          <div class="bar-label"><span>❤️ Тепло</span><b id="mWarmVal">100%</b></div>
          <div class="bar warm"><i id="mWarmBar" style="width:100%"></i></div>
        </div>
        <div class="bar-wrap">
          <div class="bar-label"><span>💧 Сухость</span><b id="mDryVal">100%</b></div>
          <div class="bar dry"><i id="mDryBar" style="width:100%"></i></div>
        </div>
      </div>
    </div>
  </section>

  <section id="screen-report" class="screen">
    <div class="bg-anim bg-report"></div>
    <div class="screen-content center">
      <div class="report-card">
        <div class="report-label">ОТЧЁТ ПАТРУЛЯ</div>
        <div class="report-stars" id="rStars"></div>
        <div class="report-comfort" id="rComfort">0%</div>
        <div class="report-comfort-label">рейтинг комфорта</div>
        <table class="report-table" id="rTable"></table>
        <div id="rTips"></div>
        <div class="report-artifact hidden" id="rArtifact"></div>
        <button class="btn btn-primary btn-lg" id="rContinue" style="margin-top:20px">Продолжить службу</button>
      </div>
    </div>
  </section>

  <section id="screen-final" class="screen">
    <div class="bg-anim bg-final"></div>
    <div class="screen-content center">
      <div class="final-card">
        <div class="final-flag">🏁</div>
        <div class="final-label">ФИНИШ</div>
        <h2 class="final-title">Статистика прохождения</h2>

        <table class="final-table" id="fTable"></table>

        <div class="final-verdict" id="fVerdict"></div>

        <div class="final-actions">
          <button class="btn btn-ghost btn-lg" id="fRestart">🔄 Пройти заново</button>
          <button class="btn btn-primary btn-lg" id="fToStart">🏠 На главную</button>
        </div>
      </div>
    </div>
  </section>

  <section id="screen-encyclo" class="screen">
    <div class="bg-anim bg-encyclo"></div>
    <div class="screen-content">
      <header class="screen-head">
        <h2>📖 Энциклопедия патруля</h2>
        <button class="btn btn-ghost reset-btn" id="resetGameBtn">🔄 Сбросить игру</button>
        <button class="btn btn-ghost" data-close="encyclo">Закрыть (Esc)</button>
      </header>
      <h3 class="encyclo-subtitle">🏆 Артефакты климатических зон</h3>
      <div class="art-grid" id="artGrid"></div>
      <h3 class="encyclo-subtitle">✨ Легендарные материалы</h3>
      <p class="dim" style="margin-bottom:14px;max-width:1200px;margin-left:auto;margin-right:auto">Открываются по мере сбора артефактов.</p>
      <div class="legend-grid" id="legendGrid"></div>
    </div>
  </section>

</div>

<audio id="bgMusic" loop preload="auto">
  <source src="assets/background.mp3" type="audio/mpeg">
  Ваш браузер не поддерживает аудио.
</audio>

<div id="toast" class="toast"></div>

<script>
window.GAME_DATA = {
  LAYERS:     <?= json_encode($LAYERS, JSON_UNESCAPED_UNICODE) ?>,
  LEGENDARY:  <?= json_encode($LEGENDARY, JSON_UNESCAPED_UNICODE) ?>,
  ZONES:      <?= json_encode($ZONES, JSON_UNESCAPED_UNICODE) ?>,
  NPCS:       <?= json_encode($NPCS, JSON_UNESCAPED_UNICODE) ?>,
  PATTERNS:   <?= json_encode($PATTERNS, JSON_UNESCAPED_UNICODE) ?>,
  COLORS:     <?= json_encode($COLORS, JSON_UNESCAPED_UNICODE) ?>,
  SESSION: {
    score:     <?= (int)$_SESSION['score'] ?>,
    completed: <?= json_encode($_SESSION['completed']) ?>,
    artifacts: <?= json_encode($_SESSION['artifacts']) ?>,
    mgWon:     <?= $_SESSION['mgWon'] ? 'true' : 'false' ?>,
    comfort:   <?= json_encode($_SESSION['comfort']) ?>
  }
};
</script>
<script src="assets/game.js"></script>
</body>
</html>