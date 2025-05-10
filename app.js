let diseases = [];
        let allQuestions = [];
        let answers = {};
        let askedQuestions = new Set();
        let progressBar = document.getElementById("progressBar");
        let questionContainer = document.getElementById("question");
        let yesBtn = document.getElementById("yesBtn");
        let noBtn = document.getElementById("noBtn");
        let resultContainer = document.getElementById("result");
        let diagnosisBlock = document.getElementById("diagnosis");

        const maxQuestions = 8; // Максимум вопросов до завершения

        fetch("diseases.json")
          .then(res => res.json())
          .then(data => {
            diseases = data.diseases;
            prepareQuestions();
            showNextQuestion();
          });

        function prepareQuestions() {
          answers = {};
          allQuestions = [];

          diseases.forEach(disease => {
            answers[disease.id] = 0;
            disease.maxScore = disease.questions.reduce((sum, q) => sum + q.weight, 0);
            disease.questions.forEach(q => {
              allQuestions.push({
                diseaseId: disease.id,
                text: q.text,
                weight: q.weight,
                asked: false
              });
            });
          });

          // Сортировка по убыванию веса (приоритет важным вопросам)
          allQuestions.sort((a, b) => b.weight - a.weight);
        }

        function showNextQuestion() {
          const nextQuestion = allQuestions.find(q => !q.asked);
          if (!nextQuestion) return showResults();

          questionContainer.innerText = nextQuestion.text;
        }

        function recordAnswer(isYes) {
          const currentQuestion = allQuestions.find(q => !q.asked);
          if (!currentQuestion) return;

          currentQuestion.asked = true;
          askedQuestions.add(currentQuestion.text);

          if (isYes) {
            answers[currentQuestion.diseaseId] += currentQuestion.weight;
          } else {
            answers[currentQuestion.diseaseId] -= Math.floor(currentQuestion.weight / 2);
          }

          updateProgress();

          const likelyDisease = getLikelyDisease();
          const confidence = getConfidence(likelyDisease);

          const questionsAskedCount = allQuestions.filter(q => q.asked).length;
          if (confidence >= 0.7 || questionsAskedCount >= maxQuestions) {
            return showResults(likelyDisease);
          }

          showNextQuestion();
        }

        function updateProgress() {
          const questionsAskedCount = allQuestions.filter(q => q.asked).length;
          const progress = Math.min(questionsAskedCount / maxQuestions, 1);
          progressBar.style.width = `${Math.floor(progress * 100)}%`;
        }

        function getLikelyDisease() {
          return diseases.reduce((best, disease) => {
            const score = answers[disease.id];
            return !best || score > answers[best.id] ? disease : best;
          }, null);
        }

        function getConfidence(disease) {
          const score = Math.max(0, answers[disease.id]);
          return score / disease.maxScore;
        }

        function generatePdf(disease, confidence) {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            // Используем встроенный шрифт, который поддерживает кириллицу
            doc.setFont("times", "normal");

            doc.setFontSize(16);
            doc.text("Отчёт о диагнозе заболевания гороха", 20, 20);

            doc.setFontSize(14);
            doc.text(`Предполагаемое заболевание: ${disease.name} (${disease.latin})`, 20, 40);
            doc.text(`Уверенность: ${(confidence * 100).toFixed(1)}%`, 20, 50);

            doc.setFontSize(12);
            doc.text("Рекомендации по лечению:", 20, 60);
            doc.text(disease.treatment, 20, 70);

            // Генерация PDF
            doc.save('diagnosis_report.pdf');
        }

        function showResults(forceDisease = null) {
          yesBtn.classList.add("hidden");
          noBtn.classList.add("hidden");
          diagnosisBlock.classList.remove("hidden");

          const disease = forceDisease || getLikelyDisease();
          const confidence = getConfidence(disease);

          questionContainer.innerText = "Диагностика завершена.";

          if (disease && confidence >= 0.4) {
            resultContainer.innerHTML = `
              <h2 class="text-xl font-semibold text-green-700 mb-2">Предполагаемое заболевание:</h2>
              <p><strong>${disease.name}</strong> (${disease.latin})</p>
              <p class="text-sm text-gray-600 mt-1">Уверенность: ${(confidence * 100).toFixed(1)}%</p>
              <button id="downloadPdf" class="bg-green-500 text-white py-2 px-4 rounded-full mt-6">
                  Скачать отчёт в PDF
              </button>
            `;
          } else {
            resultContainer.innerHTML = `<p class="text-red-600 font-semibold">Не удалось точно определить заболевание.</p>`;
          }

          // Добавляем обработчик для кнопки скачивания PDF
          document.getElementById("downloadPdf").addEventListener("click", () => generatePdf(disease, confidence));

          // Обновляем прогресс на 100% в любом случае
          progressBar.style.width = `100%`;
        }

        yesBtn.addEventListener("click", () => recordAnswer(true));
        noBtn.addEventListener("click", () => recordAnswer(false));