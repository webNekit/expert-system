const { jsPDF } = window.jspdf;
const { PDFDocument, rgb } = PDFLib;

let diseases = [];
let allQuestions = [];
let answers = {};
let askedQuestions = new Set();
let questionsAskedCount = 0;
let maxQuestions = 12;
let confidenceChart = null;
let isDarkMode = false;

// DOM элементы
const elements = {
  progressBar: document.getElementById("progressBar"),
  progressText: document.getElementById("progressText"),
  question: document.getElementById("question"),
  yesBtn: document.getElementById("yesBtn"),
  noBtn: document.getElementById("noBtn"),
  mainResult: document.getElementById("mainResult"),
  allDiseasesList: document.getElementById("allDiseasesList"),
  diagnosisBlock: document.getElementById("diagnosis"),
  questionBlock: document.getElementById("questionBlock"),
  loadingBlock: document.getElementById("loading"),
  confidenceIndicator: document.getElementById("confidenceIndicator"),
  confidenceBar: document.getElementById("confidenceBar"),
  diseaseGraph: document.getElementById("diseaseGraph"),
  confidenceChartCanvas: document.getElementById("confidenceChart"),
  restartBtn: document.getElementById("restartBtn"),
  downloadPdfBtn: document.getElementById("downloadPdf"),
  themeToggle: document.getElementById("themeToggle"),
  themeIcon: document.getElementById("themeIcon"),
  themeIconPath: document.getElementById("themeIconPath"),
  body: document.body,
};

// Проверяем сохраненную тему
function checkSavedTheme() {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark") {
    enableDarkMode();
  } else if (savedTheme === "light") {
    enableLightMode();
  } else if (
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    enableDarkMode();
  }
}

// Включение темной темы
function enableDarkMode() {
  elements.body.classList.remove("light-theme");
  elements.body.classList.add("dark-theme");
  isDarkMode = true;
  localStorage.setItem("theme", "dark");
  // Меняем иконку на луну
  elements.themeIconPath.setAttribute(
    "d",
    "M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
  );
  updateChartTheme();
}

// Включение светлой темы
function enableLightMode() {
  elements.body.classList.remove("dark-theme");
  elements.body.classList.add("light-theme");
  isDarkMode = false;
  localStorage.setItem("theme", "light");
  // Меняем иконку на солнце
  elements.themeIconPath.setAttribute(
    "d",
    "M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
  );
  updateChartTheme();
}

// Переключение темы
function toggleTheme() {
  if (isDarkMode) {
    enableLightMode();
  } else {
    enableDarkMode();
  }
}

// Обновление темы графика
function updateChartTheme() {
  if (!confidenceChart) return;

  const textColor = isDarkMode ? "#f9fafb" : "#111827";
  const gridColor = isDarkMode ? "#374151" : "#e5e7eb";

  confidenceChart.options.scales.x.ticks.color = textColor;
  confidenceChart.options.scales.y.ticks.color = textColor;
  confidenceChart.options.scales.x.title.color = textColor;
  confidenceChart.options.scales.y.title.color = textColor;
  confidenceChart.options.scales.x.grid.color = gridColor;
  confidenceChart.options.scales.y.grid.color = gridColor;

  confidenceChart.update();
}

// Загрузка данных
fetch("./diseases.json")
  .then((res) => res.json())
  .then((data) => {
    diseases = data.diseases;
    prepareQuestions();
    showNextQuestion();
  })
  .catch((err) => {
    elements.question.innerText =
      "Ошибка загрузки данных о заболеваниях. Пожалуйста, обновите страницу.";
    console.error(err);
  });

function prepareQuestions() {
  answers = {};
  allQuestions = [];
  askedQuestions = new Set();
  questionsAskedCount = 0;

  // Инициализация структуры для хранения ответов
  diseases.forEach((disease) => {
    answers[disease.id] = {
      positive: 0, // Сумма весов положительных ответов
      negative: 0, // Сумма весов отрицательных ответов
      possible: disease.questions.reduce((sum, q) => sum + q.weight, 0), // Максимально возможный балл
      name: disease.name,
      latin: disease.latin,
      treatment: disease.treatment,
      questions: disease.questions.map((q) => q.text), // Все вопросы для этого заболевания
    };

    // Добавляем все вопросы в общий пул
    disease.questions.forEach((q) => {
      if (!allQuestions.some((aq) => aq.text === q.text)) {
        allQuestions.push({
          text: q.text,
          weight: q.weight,
          asked: false,
          diseases: [], // Заболевания, для которых этот вопрос актуален
        });
      }

      // Находим вопрос в общем пуле и добавляем к нему заболевание
      const question = allQuestions.find((aq) => aq.text === q.text);
      if (question) {
        question.diseases.push({
          id: disease.id,
          weight: q.weight,
        });
      }
    });
  });

  // Рассчитываем информативность каждого вопроса
  allQuestions.forEach((question) => {
    // Информативность = насколько хорошо вопрос различает заболевания
    // Чем меньше заболеваний содержат этот вопрос, тем он информативнее
    const diseaseCount = question.diseases.length;
    const avgWeight =
      question.diseases.reduce((sum, d) => sum + d.weight, 0) / diseaseCount;
    question.informativeness = (1 / diseaseCount) * avgWeight;
  });

  // Сортируем вопросы по информативности
  allQuestions.sort((a, b) => b.informativeness - a.informativeness);
}

function showNextQuestion() {
  updateDiseaseProbabilities();

  // Проверяем условия завершения
  if (
    questionsAskedCount >= maxQuestions ||
    allQuestions.every((q) => q.asked)
  ) {
    return showResults();
  }

  // Выбираем следующий вопрос
  const nextQuestion = selectNextQuestion();

  if (!nextQuestion) {
    return showResults();
  }

  elements.question.innerText = nextQuestion.text;
  nextQuestion.asked = true;
  askedQuestions.add(nextQuestion.text);

  // Показываем индикатор уверенности для топ-1 заболевания
  const topDisease = getTopDiseases(1)[0];
  if (topDisease) {
    elements.confidenceIndicator.classList.remove("hidden");
    elements.confidenceBar.style.width = `${Math.floor(
      topDisease.confidence * 100
    )}%`;
  }
}

function selectNextQuestion() {
  // Находим наиболее информативный не заданный вопрос
  return allQuestions.find((q) => !q.asked);
}

function updateDiseaseProbabilities() {
  diseases.forEach((disease) => {
    const data = answers[disease.id];
    // Уверенность = (положительные ответы - 0.5*отрицательные) / максимально возможный балл
    data.confidence = Math.max(
      0,
      (data.positive - data.negative * 0.5) / data.possible
    );
  });

  updateConfidenceChart();
}

function getTopDiseases(count) {
  return [...diseases]
    .map((disease) => ({
      id: disease.id,
      name: disease.name,
      latin: disease.latin,
      treatment: disease.treatment,
      confidence: answers[disease.id].confidence,
    }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, count);
}

function recordAnswer(isYes) {
  questionsAskedCount++;

  const currentQuestion = allQuestions.find(
    (q) => q.text === elements.question.innerText
  );

  if (currentQuestion) {
    currentQuestion.diseases.forEach((disease) => {
      if (isYes) {
        answers[disease.id].positive += disease.weight;
      } else {
        answers[disease.id].negative += disease.weight;
      }
    });
  }

  updateProgress();
  showNextQuestion();
}

function updateProgress() {
  const progress = Math.min(questionsAskedCount / maxQuestions, 1);
  elements.progressBar.style.width = `${Math.floor(progress * 100)}%`;
  elements.progressText.innerText = `${Math.floor(progress * 100)}%`;
}

function updateConfidenceChart() {
  const topDiseases = getTopDiseases(5);

  const labels = topDiseases.map((d) => d.name);
  const confidences = topDiseases.map((d) => d.confidence * 100);
  const backgroundColors = confidences.map(
    (c, i) => `hsl(${200 + i * 60}, 70%, 50%)`
  );

  const textColor = isDarkMode ? "#f9fafb" : "#111827";
  const gridColor = isDarkMode ? "#374151" : "#e5e7eb";

  if (confidenceChart) {
    confidenceChart.data.labels = labels;
    confidenceChart.data.datasets[0].data = confidences;
    confidenceChart.data.datasets[0].backgroundColor = backgroundColors;

    // Обновляем цвета для темной/светлой темы
    confidenceChart.options.scales.x.ticks.color = textColor;
    confidenceChart.options.scales.y.ticks.color = textColor;
    confidenceChart.options.scales.x.title.color = textColor;
    confidenceChart.options.scales.y.title.color = textColor;
    confidenceChart.options.scales.x.grid.color = gridColor;
    confidenceChart.options.scales.y.grid.color = gridColor;

    confidenceChart.update();
  } else {
    confidenceChart = new Chart(elements.confidenceChartCanvas, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Вероятность заболевания (%)",
            data: confidences,
            backgroundColor: backgroundColors,
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            ticks: {
              color: textColor,
            },
            title: {
              display: true,
              text: "Вероятность (%)",
              color: textColor,
            },
            grid: {
              color: gridColor,
            },
          },
          x: {
            ticks: {
              color: textColor,
            },
            title: {
              display: true,
              text: "Заболевания",
              color: textColor,
            },
            grid: {
              color: gridColor,
            },
          },
        },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                return `${context.dataset.label}: ${context.raw.toFixed(1)}%`;
              },
            },
          },
        },
      },
    });
  }
}

async function generatePdf() {
  try {
    elements.loadingBlock.classList.remove("hidden");
    elements.questionBlock.classList.add("hidden");
    elements.diagnosisBlock.classList.add("hidden");

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Создаем новый PDF документ
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    // Загружаем шрифт с поддержкой кириллицы
    const fontUrl =
      "https://cdn.jsdelivr.net/npm/@openfonts/noto-sans-cyrillic_all@1.44.0/files/noto-sans-cyrillic-400-normal.woff";
    const fontBytes = await fetch(fontUrl).then((res) => res.arrayBuffer());
    const customFont = await pdfDoc.embedFont(fontBytes);

    // Добавляем новую страницу
    const page = pdfDoc.addPage([595, 842]); // A4 размер

    // Получаем данные для отчета
    const topDisease = getTopDiseases(1)[0];
    const allDiseases = getTopDiseases(diseases.length);
    const date = new Date().toLocaleDateString();

    // Рисуем текст на странице
    const drawText = (text, x, y, size = 12, bold = false) => {
      page.drawText(text, {
        x,
        y: 842 - y, // PDF координаты начинаются снизу
        size,
        font: customFont,
        color: rgb(0, 0, 0),
        ...(bold && { font: customFont }), // Для жирного текста
      });
    };

    // Заголовок
    drawText("Отчёт о диагностике заболеваний гороха", 50, 50, 18, true);

    // Информация о диагностике
    drawText(`Дата диагностики: ${date}`, 50, 80);
    drawText(`Количество заданных вопросов: ${questionsAskedCount}`, 50, 100);

    // Основной диагноз
    drawText("Наиболее вероятное заболевание:", 50, 140, 14, true);
    drawText(`${topDisease.name} (${topDisease.latin})`, 50, 160);
    drawText(
      `Вероятность: ${(topDisease.confidence * 100).toFixed(1)}%`,
      50,
      180
    );

    // Все заболевания
    drawText("Все возможные заболевания:", 50, 220, 14, true);

    let yPos = 240;
    allDiseases.forEach((disease) => {
      if (disease.confidence > 0.1) {
        drawText(
          `${disease.name}: ${(disease.confidence * 100).toFixed(1)}%`,
          50,
          yPos
        );
        yPos += 20;
      }
    });

    // Рекомендации
    drawText("Рекомендации по лечению:", 50, yPos + 20, 14, true);

    // Разбиваем текст рекомендаций на строки
    const treatmentLines = splitTextIntoLines(topDisease.treatment, 90);
    treatmentLines.forEach((line, i) => {
      drawText(line, 50, yPos + 40 + i * 20);
    });

    // Добавляем график
    try {
      const chartImage = await getChartImage();
      if (chartImage) {
        const image = await pdfDoc.embedPng(chartImage);
        const scale = 0.5;
        page.drawImage(image, {
          x: 50,
          y: 842 - (yPos + 100 + treatmentLines.length * 20),
          width: image.width * scale,
          height: image.height * scale,
        });
      }
    } catch (e) {
      console.error("Ошибка при добавлении графика:", e);
    }

    // Сохраняем PDF
    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Диагностика_гороха_${date.replace(/\./g, "-")}.pdf`;
    link.click();
  } catch (error) {
    console.error("Ошибка при генерации PDF:", error);
    alert(
      "Произошла ошибка при генерации отчета. Пожалуйста, попробуйте еще раз."
    );
  } finally {
    elements.loadingBlock.classList.add("hidden");
    elements.diagnosisBlock.classList.remove("hidden");
  }
}

// Функция для получения изображения графика
async function getChartImage() {
  return new Promise((resolve) => {
    if (!confidenceChart) return resolve(null);

    const canvas = document.createElement("canvas");
    canvas.width = elements.confidenceChartCanvas.width;
    canvas.height = elements.confidenceChartCanvas.height;

    const ctx = canvas.getContext("2d");
    // Устанавливаем белый фон для графика в PDF
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(elements.confidenceChartCanvas, 0, 0);

    canvas.toBlob((blob) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    }, "image/png");
  });
}

// Функция для разбивки текста на строки
function splitTextIntoLines(text, maxLength) {
  const words = text.split(" ");
  const lines = [];
  let currentLine = "";

  words.forEach((word) => {
    if (currentLine.length + word.length <= maxLength) {
      currentLine += (currentLine ? " " : "") + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function showResults() {
  elements.yesBtn.classList.add("hidden");
  elements.noBtn.classList.add("hidden");
  elements.questionBlock.classList.add("hidden");
  elements.diagnosisBlock.classList.remove("hidden");

  const topDisease = getTopDiseases(1)[0];
  const allDiseases = getTopDiseases(diseases.length);

  // Основной результат
  elements.mainResult.innerHTML = `
                <div class="card-bg border border-color rounded-xl p-5 mb-4">
                    <h2 class="text-xl font-semibold text-primary mb-2">Наиболее вероятное заболевание</h2>
                    <p class="text-lg"><strong>${
                      topDisease.name
                    }</strong> (<em>${topDisease.latin}</em>)</p>
                    <p class="text-sm text-secondary mt-1">Вероятность: ${(
                      topDisease.confidence * 100
                    ).toFixed(1)}%</p>
                    <div class="mt-4">
                        <h3 class="font-semibold text-primary mb-1">Рекомендации по лечению:</h3>
                        <p class="text-secondary">${topDisease.treatment}</p>
                    </div>
                </div>
            `;

  // Список всех заболеваний
  elements.allDiseasesList.innerHTML = "";
  allDiseases.forEach((disease) => {
    if (disease.confidence > 0.05) {
      const confidencePercent = (disease.confidence * 100).toFixed(1);
      elements.allDiseasesList.innerHTML += `
                        <div class="disease-card card-bg border border-color rounded-lg p-3">
                            <div class="flex justify-between items-center mb-1">
                                <strong class="text-primary">${
                                  disease.name
                                }</strong>
                                <span class="text-sm font-medium ${
                                  disease.confidence > 0.5
                                    ? "text-green-600"
                                    : disease.confidence > 0.2
                                    ? "text-yellow-600"
                                    : "text-secondary"
                                }">
                                    ${confidencePercent}%
                                </span>
                            </div>
                            <div class="w-full progress-bg h-2 rounded-full overflow-hidden">
                                <div class="h-full ${
                                  disease.confidence > 0.5
                                    ? "bg-green-500"
                                    : disease.confidence > 0.2
                                    ? "bg-yellow-500"
                                    : "bg-gray-400"
                                }" 
                                     style="width: ${confidencePercent}%"></div>
                            </div>
                        </div>
                    `;
    }
  });

  elements.progressBar.style.width = `100%`;
  elements.progressText.innerText = `100%`;
}

function restartDiagnosis() {
  prepareQuestions();
  elements.diagnosisBlock.classList.add("hidden");
  elements.questionBlock.classList.remove("hidden");
  elements.yesBtn.classList.remove("hidden");
  elements.noBtn.classList.remove("hidden");
  elements.progressBar.style.width = `0%`;
  elements.progressText.innerText = `0%`;
  questionsAskedCount = 0;

  if (confidenceChart) {
    confidenceChart.destroy();
    confidenceChart = null;
  }

  showNextQuestion();
}

// Инициализация при загрузке страницы
document.addEventListener("DOMContentLoaded", () => {
  // Проверяем сохраненную тему
  checkSavedTheme();

  // Обработчики событий
  elements.yesBtn.addEventListener("click", () => recordAnswer(true));
  elements.noBtn.addEventListener("click", () => recordAnswer(false));
  elements.restartBtn.addEventListener("click", restartDiagnosis);
  elements.downloadPdfBtn.addEventListener("click", generatePdf);
  elements.themeToggle.addEventListener("click", toggleTheme);
});
