# 📘 **ПОЛНАЯ СПЕЦИФИКАЦИЯ ПЛАГИНА MAX LOYALTY ДЛЯ iiko FRONT**


***

## **🎯 1. ОБЩЕЕ ОПИСАНИЕ**

### **Назначение:**

Плагин для интеграции системы лояльности Max Loyalty в iiko Front. Позволяет сотрудникам ресторана (кассирам, официантам, менеджерам) привязывать карты гостей к заказам, применять бонусы/скидки и начислять баллы.

### **Технологический стек:**

- **Язык:** C\# (.NET Framework 4.7.2+)
- **UI:** WPF (Windows Presentation Foundation)
- **API:** iiko Front Plugin SDK
- **Backend:** REST API Max Loyalty (NestJS)
- **Логирование:** Serilog
- **Кеширование:** MemoryCache
- **HTTP:** HttpClient с Polly (retry policies)


### **Платформа:**

- Windows 10/11
- iiko Front 7.x+

***

## **🏗️ 2. АРХИТЕКТУРА ПЛАГИНА**

### **Структура проекта:**

```
MaxLoyaltyIikoPlugin/
├── Plugin.cs                      # Главный класс плагина
├── Services/
│   ├── LoyaltyApiClient.cs       # HTTP клиент для API
│   ├── CacheService.cs           # Кеширование данных
│   ├── OfflineQueueService.cs    # Offline очередь
│   ├── HealthCheckService.cs     # Проверка доступности backend
│   ├── ConfigService.cs          # Конфигурация
│   ├── TimeService.cs            # Синхронизация времени
│   ├── StorageManager.cs         # Управление локальным хранилищем
│   └── MetricsService.cs         # Сбор метрик
├── UI/
│   ├── Windows/
│   │   ├── LoyaltySearchWindow.xaml        # Окно поиска гостя
│   │   ├── LoyaltyOperationWindow.xaml     # Окно операции (баллы/скидка)
│   │   ├── DiagnosticsWindow.xaml          # Диагностика
│   │   └── ErrorDialog.xaml                # Окно ошибок
│   ├── Controls/
│   │   ├── NumericKeypad.xaml              # Цифровая клавиатура
│   │   └── LoadingOverlay.xaml             # Индикатор загрузки
│   └── Styles/
│       └── MaxLoyaltyStyles.xaml           # Стили UI
├── Models/
│   ├── GuestInfo.cs              # Модель гостя
│   ├── CalculateResponse.cs      # Ответ calculate
│   ├── LoyaltyContext.cs         # Контекст заказа
│   ├── RestaurantConfig.cs       # Конфигурация ресторана
│   └── ApiRequests.cs            # DTO для API запросов
├── Validators/
│   └── LoyaltyValidator.cs       # Валидация операций
├── Utils/
│   ├── ErrorHandler.cs           # Обработка ошибок
│   ├── RetryPolicy.cs            # Retry стратегии
│   └── Encryption.cs             # Шифрование API Key
└── Config/
    ├── appsettings.json          # Конфигурация (шифрованная)
    └── installer-config.json     # Конфиг установщика
```


***

## **⚙️ 3. ИНИЦИАЛИЗАЦИЯ ПЛАГИНА**

### **3.1. Установка**

**Персональный установщик для каждого ресторана:**

```
MaxLoyaltyInstaller_Restaurant123.exe
├── Содержит:
│   ├── MaxLoyaltyIikoPlugin.dll
│   ├── Зашифрованный API Key
│   ├── URL backend API
│   └── Restaurant ID
```

**Процесс установки:**

1. Определяет путь установки iiko Front (автоматически)
2. Копирует `.dll` в папку `Plugins/`
3. Создает зашифрованный конфиг в `%AppData%/MaxLoyaltyIiko/`
4. Регистрирует плагин в iiko
5. Предлагает перезапустить iiko Front

### **3.2. InitializePlugin()**

```csharp
public class MaxLoyaltyPlugin : IFrontPlugin
{
    private IPluginContext pluginContext;
    private IOperationService operations;
    
    // Services
    private LoyaltyApiClient apiClient;
    private CacheService cacheService;
    private OfflineQueueService offlineQueue;
    private HealthCheckService healthCheck;
    private ConfigService configService;
    private MetricsService metricsService;
    
    // Payment Types
    private IPaymentType pointsPaymentType;    // Накопительная (editable)
    private IPaymentType discountPaymentType;  // Скидочная (non-editable)
    
    // Restaurant Config
    private RestaurantConfig restaurantConfig;
    
    public void InitializePlugin(IPluginContext context)
    {
        pluginContext = context;
        operations = context.Operations;
        
        // 1. Настройка логирования
        ConfigureLogging();
        
        // 2. Загрузка конфигурации
        configService = new ConfigService();
        var config = configService.LoadConfig(); // Расшифровка API Key
        
        // 3. Инициализация сервисов
        apiClient = new LoyaltyApiClient(config);
        cacheService = new CacheService();
        offlineQueue = new OfflineQueueService();
        healthCheck = new HealthCheckService(apiClient);
        metricsService = new MetricsService(apiClient);
        
        // 4. Загрузка конфигурации ресторана с backend
        LoadRestaurantConfigAsync().Wait();
        
        // 5. Синхронизация времени
        var timeService = new TimeService();
        timeService.SyncWithServerAsync(apiClient).Wait();
        
        // 6. Регистрация кнопки в "ДОПОЛНЕНИЯ"
        RegisterButton();
        
        // 7. Регистрация Payment Types
        RegisterPaymentTypes();
        
        // 8. Подписка на события
        SubscribeToEvents();
        
        // 9. Обработка offline очереди
        ProcessOfflineQueueAsync();
        
        // 10. Проверка хранилища
        var storageManager = new StorageManager();
        storageManager.CheckStorageLimit();
        
        logger.LogInformation(
            "Max Loyalty Plugin initialized successfully. " +
            "Version: {Version}, Restaurant: {RestaurantName}",
            GetPluginVersion(),
            restaurantConfig.RestaurantName
        );
    }
    
    private void RegisterButton()
    {
        operations.RegisterButton(
            buttonText: "Max Loyalty",
            buttonCategory: ButtonCategory.Additions, // Вкладка "ДОПОЛНЕНИЯ"
            handler: OnLoyaltyButtonClick,
            icon: LoadPluginIcon()
        );
    }
    
    private void RegisterPaymentTypes()
    {
        // POINTS: редактируемый payment type
        pointsPaymentType = operations.RegisterPaymentType(
            name: "MAX_LOYALTY_POINTS",
            displayName: "Max Loyalty - Баллы",
            canBeProcessedExternally: true,
            isEditable: true  // ✅ Можно менять на странице оплаты
        );
        
        // DISCOUNT: НЕ редактируемый payment type
        discountPaymentType = operations.RegisterPaymentType(
            name: "MAX_LOYALTY_DISCOUNT",
            displayName: "Max Loyalty - Скидка",
            canBeProcessedExternally: true,
            isEditable: false  // ❌ Фиксированная сумма
        );
        
        logger.LogInformation(
            "Payment types registered: POINTS (editable), DISCOUNT (non-editable)"
        );
    }
    
    private void SubscribeToEvents()
    {
        operations.OrderClosed += OnOrderClosed;
        operations.PaymentEdited += OnPaymentEdited;
    }
}
```


***

## **🎨 4. UI/UX WORKFLOW**

### **4.1. Точка входа**

**Кнопка в меню "ДОПОЛНЕНИЯ":**

```
iiko Front → Открыт заказ → Нажимаем "ДОПОЛНЕНИЯ" внизу
→ Появляется меню с плагинами
→ Выбираем "Max Loyalty"
```


### **4.2. Окно 1: Поиск гостя**

**Интерфейс:**

```
┌─────────────────────────────────────────┐
│         MAX LOYALTY                      │
│  Введите номер телефона или код карты   │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  [Телефон]  [6-значный код]     │   │ ← Табы
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │                                 │   │
│  │     +7 ___ ___ __ __           │   │ ← Поле ввода
│  │                                 │   │
│  └─────────────────────────────────┘   │
│                                         │
│       ┌───┬───┬───┐                    │
│       │ 1 │ 2 │ 3 │                    │
│       ├───┼───┼───┤                    │ ← Цифровая
│       │ 4 │ 5 │ 6 │                    │   клавиатура
│       ├───┼───┼───┤                    │
│       │ 7 │ 8 │ 9 │                    │
│       ├───┼───┼───┤                    │
│       │ ← │ 0 │ ✓ │                    │
│       └───┴───┴───┘                    │
│                                         │
│  [OK]  [Отмена]  [Создать гостя]      │
├─────────────────────────────────────────┤
│ Сумма заказа: 890,00 ₽                 │
└─────────────────────────────────────────┘
```

**Логика:**

```csharp
private async void OnOkClick(object sender, RoutedEventArgs e)
{
    var input = InputField.Text.Trim();
    
    // Валидация
    if (string.IsNullOrEmpty(input))
    {
        ShowError("Введите номер телефона или код");
        return;
    }
    
    ShowLoading("Поиск гостя...");
    
    try
    {
        // 1. Поиск гостя
        var searchResponse = await apiClient.SearchGuestAsync(new SearchRequest
        {
            Phone = IsPhone(input) ? input : null,
            Code6Digit = IsCode6(input) ? input : null
        });
        
        if (!searchResponse.Found)
        {
            HideLoading();
            
            var result = MessageBox.Show(
                "Гость не найден. Создать нового?",
                "Гость не найден",
                MessageBoxButton.YesNo
            );
            
            if (result == MessageBoxResult.Yes)
            {
                OpenCreateGuestWindow(input);
            }
            
            return;
        }
        
        var guest = searchResponse.Guest;
        
        // 2. Calculate для текущего заказа
        var checkAmount = GetOrderAmount(currentOrder);
        
        var calcResponse = await apiClient.CalculateAsync(new CalculateRequest
        {
            GuestCardId = guest.CardId,
            CheckAmount = checkAmount,
            OrderCategories = GetOrderCategories(currentOrder),
            OrderType = GetOrderType(currentOrder), // DINE_IN/DELIVERY/TAKEAWAY
            CalculateOnly = true
        });
        
        HideLoading();
        
        // 3. Открываем окно операции
        OpenOperationWindow(guest, calcResponse);
    }
    catch (Exception ex)
    {
        HideLoading();
        HandleError(ex);
    }
}
```


### **4.3. Окно 2: Операция (Баллы или Скидка)**

**Backend возвращает `benefitType`:**

```json
{
  "benefitType": "POINTS",  // или "DISCOUNT"
  "regularBalance": 2450,
  "promoBalance": 0,
  "maxAllowedToSpend": 178,
  "pointsToEarn": 45,
  "checkAmount": 890
}
```

**Интерфейс зависит от типа:**

#### **Вариант A: POINTS (накопительная)**

```
┌──────────────────────────────────────────────────┐
│ Списание/начисление баллов                       │
├──────────────────────────────────────────────────┤
│                                                  │
│  Сумма покупки:           890,00 ₽              │
│  Бонусный баланс:       2 450,00 ₽ 💰          │
│  Доступно для списания:   178,00 ₽              │
│  Списать баллов:       [____178__] ✏️          │
│  Будет начислено:         +45 баллов            │
│                                                  │
├──────────────────────────────────────────────────┤
│  [Начислить] [Списать] [Отвязать] [Отмена]      │
└──────────────────────────────────────────────────┘
│ ИНФОРМАЦИЯ О ГОСТЕ:                              │
│ Иван Петров                                      │
│ +7 999 123 45 67                                 │
│ ⭐ Gold                                          │
└──────────────────────────────────────────────────┘
```


#### **Вариант B: DISCOUNT (скидочная)**

```
┌──────────────────────────────────────────────────┐
│ Применение скидки                                │
├──────────────────────────────────────────────────┤
│                                                  │
│  Сумма покупки:           890,00 ₽              │
│  Процент скидки:              20% 🎁            │
│  Сумма скидки:            178,00 ₽              │
│  К оплате:                712,00 ₽              │
│                                                  │
├──────────────────────────────────────────────────┤
│  [Применить скидку] [Отвязать] [Отмена]         │
└──────────────────────────────────────────────────┘
│ ИНФОРМАЦИЯ О ГОСТЕ:                              │
│ Мария Сидорова                                   │
│ +7 999 765 43 21                                 │
│ ⭐ Silver (скидка 20%)                           │
└──────────────────────────────────────────────────┘
```

**Логика кнопок:**

```csharp
// Кнопка "Начислить" (только для POINTS)
private void OnEarnClick(object sender, RoutedEventArgs e)
{
    // Только начисление, без списания
    ApplyLoyalty(LoyaltyAction.EarnOnly);
}

// Кнопка "Списать" (для POINTS)
private async void OnSpendClick(object sender, RoutedEventArgs e)
{
    var pointsToSpend = decimal.Parse(PointsToSpendInput.Text);
    
    if (pointsToSpend <= 0)
    {
        ShowError("Укажите сумму для списания");
        return;
    }
    
    if (pointsToSpend > maxAllowed)
    {
        ShowError($"Максимум доступно: {maxAllowed:N0} ₽");
        return;
    }
    
    await ApplyPointsPayment(pointsToSpend);
}

// Кнопка "Применить скидку" (для DISCOUNT)
private async void OnApplyDiscountClick(object sender, RoutedEventArgs e)
{
    await ApplyDiscountPayment();
}

// Кнопка "Отвязать карту"
private async void OnUnbindClick(object sender, RoutedEventArgs e)
{
    var result = MessageBox.Show(
        "Отвязать карту от заказа?",
        "Подтверждение",
        MessageBoxButton.YesNo
    );
    
    if (result == MessageBoxResult.Yes)
    {
        await UnbindCard();
    }
}
```


***

## **💳 5. ПРИМЕНЕНИЕ К ЗАКАЗУ**

### **5.1. POINTS → Editable Payment**

```csharp
private async Task ApplyPointsPayment(decimal pointsToSpend)
{
    try
    {
        ShowLoading("Резервирование баллов...");
        
        // 1. Резервируем баллы на backend
        var reserveResponse = await apiClient.ReservePointsAsync(new ReserveRequest
        {
            GuestCardId = currentGuest.CardId,
            PointsToSpend = pointsToSpend,
            MaxAllowed = maxAllowed,
            CheckAmount = checkAmount,
            OrderId = currentOrder.Id.ToString(),
            RestaurantId = restaurantConfig.RestaurantId
        });
        
        if (!reserveResponse.Success)
        {
            HideLoading();
            ShowError(reserveResponse.Error);
            return;
        }
        
        // 2. Добавляем PAYMENT к заказу iiko
        var payment = operations.CreatePayment(
            paymentType: pointsPaymentType,  // MAX_LOYALTY_POINTS (editable)
            sum: pointsToSpend
        );
        
        payment.Comment = $"MaxLoyalty:Type=POINTS:Guest={currentGuest.CardId}:Res={reserveResponse.ReservationId}";
        
        operations.AddPreliminaryPayment(payment, currentOrder);
        
        // 3. Сохраняем контекст заказа
        SaveOrderLoyaltyContext(currentOrder, new LoyaltyContext
        {
            GuestCardId = currentGuest.CardId,
            GuestName = currentGuest.Name,
            BenefitType = BenefitType.Points,
            Action = LoyaltyAction.Spend,
            PointsToSpend = pointsToSpend,
            MaxAllowed = maxAllowed,
            PointsToEarn = pointsToEarn,
            ReservationId = reserveResponse.ReservationId,
            OriginalCheckAmount = checkAmount,
            AppliedAt = DateTime.Now
        });
        
        HideLoading();
        
        // 4. Метрики
        metricsService.RecordMetric("loyalty.points.applied", pointsToSpend);
        
        // 5. Закрываем окно
        ShowSuccess(
            $"✅ Списание {pointsToSpend:N0}₽ баллов применено\n\n" +
            $"💡 Сумму можно изменить на странице оплаты"
        );
        
        this.DialogResult = true;
        this.Close();
    }
    catch (Exception ex)
    {
        HideLoading();
        HandleError(ex);
    }
}
```


### **5.2. DISCOUNT → Non-Editable Payment**

```csharp
private async Task ApplyDiscountPayment()
{
    try
    {
        ShowLoading("Применение скидки...");
        
        // 1. Резервируем на backend
        var reserveResponse = await apiClient.ReserveDiscountAsync(new ReserveRequest
        {
            GuestCardId = currentGuest.CardId,
            DiscountPercentage = discountPercentage,
            DiscountAmount = discountAmount,
            CheckAmount = checkAmount,
            OrderId = currentOrder.Id.ToString(),
            RestaurantId = restaurantConfig.RestaurantId
        });
        
        if (!reserveResponse.Success)
        {
            HideLoading();
            ShowError(reserveResponse.Error);
            return;
        }
        
        // 2. Добавляем PAYMENT к заказу iiko
        var payment = operations.CreatePayment(
            paymentType: discountPaymentType,  // MAX_LOYALTY_DISCOUNT (non-editable)
            sum: discountAmount
        );
        
        payment.Comment = $"MaxLoyalty:Type=DISCOUNT:Percent={discountPercentage}:Guest={currentGuest.CardId}:Res={reserveResponse.ReservationId}";
        
        operations.AddPreliminaryPayment(payment, currentOrder);
        
        // 3. Сохраняем контекст
        SaveOrderLoyaltyContext(currentOrder, new LoyaltyContext
        {
            GuestCardId = currentGuest.CardId,
            GuestName = currentGuest.Name,
            BenefitType = BenefitType.Discount,
            Action = LoyaltyAction.ApplyDiscount,
            DiscountPercentage = discountPercentage,
            DiscountAmount = discountAmount,
            ReservationId = reserveResponse.ReservationId,
            OriginalCheckAmount = checkAmount,
            AppliedAt = DateTime.Now
        });
        
        HideLoading();
        
        // 4. Метрики
        metricsService.RecordMetric("loyalty.discount.applied", discountAmount);
        
        // 5. Закрываем окно
        ShowSuccess(
            $"✅ Скидка {discountPercentage}% ({discountAmount:N0}₽) применена\n\n" +
            $"🔒 Сумма фиксирована и не может быть изменена"
        );
        
        this.DialogResult = true;
        this.Close();
    }
    catch (Exception ex)
    {
        HideLoading();
        HandleError(ex);
    }
}
```


### **5.3. EARN ONLY (только начисление)**

```csharp
private void ApplyEarnOnly()
{
    // Не добавляем payment, только сохраняем контекст
    SaveOrderLoyaltyContext(currentOrder, new LoyaltyContext
    {
        GuestCardId = currentGuest.CardId,
        GuestName = currentGuest.Name,
        BenefitType = BenefitType.Points,
        Action = LoyaltyAction.EarnOnly,
        PointsToEarn = pointsToEarn,
        OriginalCheckAmount = checkAmount,
        AppliedAt = DateTime.Now
    });
    
    ShowSuccess(
        $"✅ Карта привязана для начисления\n\n" +
        $"Будет начислено: +{pointsToEarn} баллов"
    );
    
    this.DialogResult = true;
    this.Close();
}
```


***

## **💰 6. СТРАНИЦА ОПЛАТЫ**

### **6.1. Отображение payment**

**POINTS (редактируемый):**

```
┌──────────────────────────────────────┐
│ К ОПЛАТЕ: 890,00 р.                  │
│                                      │
│ ✅ Max Loyalty - Баллы               │
│    [178,00 р.] ✏️ ← можно менять    │
│                                      │
│ 💵 НАЛИЧНЫЕ                          │
│    [712,00 р.]                       │
└──────────────────────────────────────┘
```

**DISCOUNT (фиксированный):**

```
┌──────────────────────────────────────┐
│ К ОПЛАТЕ: 890,00 р.                  │
│                                      │
│ ✅ Max Loyalty - Скидка 20%          │
│    178,00 р. 🔒 ← нельзя менять     │
│                                      │
│ 💵 НАЛИЧНЫЕ                          │
│    [712,00 р.]                       │
└──────────────────────────────────────┘
```


### **6.2. Обработка изменения payment**

```csharp
private async void OnPaymentEdited(object sender, PaymentEditedEventArgs e)
{
    // Проверяем это наш payment
    if (e.Payment.PaymentType.Name == "MAX_LOYALTY_POINTS")
    {
        await HandlePointsPaymentEdit(e);
    }
    else if (e.Payment.PaymentType.Name == "MAX_LOYALTY_DISCOUNT")
    {
        // DISCOUNT не должен редактироваться, но защищаемся
        HandleDiscountPaymentEdit(e);
    }
}

private async Task HandlePointsPaymentEdit(PaymentEditedEventArgs e)
{
    var context = GetOrderLoyaltyContext(e.Order);
    
    if (context == null)
        return;
    
    var newAmount = e.Payment.Sum;
    var oldAmount = context.PointsToSpend;
    
    if (newAmount == oldAmount)
        return; // Не изменилось
    
    logger.LogInformation(
        "Points payment edited: Order={OrderId}, Old={Old}, New={New}",
        e.Order.Id,
        oldAmount,
        newAmount
    );
    
    // Валидация
    if (newAmount > context.MaxAllowed)
    {
        ShowError($"Максимум: {context.MaxAllowed:N0}₽");
        e.Payment.Sum = oldAmount;
        operations.UpdatePayment(e.Payment, e.Order);
        return;
    }
    
    if (newAmount < 0)
    {
        ShowError("Сумма не может быть отрицательной");
        e.Payment.Sum = oldAmount;
        operations.UpdatePayment(e.Payment, e.Order);
        return;
    }
    
    try
    {
        // Обновляем резервацию на backend
        await apiClient.UpdateReservationAsync(new UpdateReservationRequest
        {
            ReservationId = context.ReservationId,
            NewAmount = newAmount,
            OldAmount = oldAmount
        });
        
        // Обновляем контекст
        context.PointsToSpend = newAmount;
        SaveOrderLoyaltyContext(e.Order, context);
        
        metricsService.RecordMetric("loyalty.points.edited", 1);
        
        logger.LogInformation("Reservation updated successfully");
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Failed to update reservation");
        
        ShowError("Не удалось обновить резервацию. Возвращаем исходную сумму.");
        
        e.Payment.Sum = oldAmount;
        operations.UpdatePayment(e.Payment, e.Order);
    }
}

private void HandleDiscountPaymentEdit(PaymentEditedEventArgs e)
{
    var context = GetOrderLoyaltyContext(e.Order);
    
    if (context == null)
        return;
    
    // Если каким-то образом изменили - возвращаем назад
    if (e.Payment.Sum != context.DiscountAmount)
    {
        logger.LogWarning(
            "Attempt to edit non-editable discount payment blocked"
        );
        
        e.Payment.Sum = context.DiscountAmount;
        operations.UpdatePayment(e.Payment, e.Order);
        
        ShowWarning(
            $"⚠️ Скидка фиксирована\n\n" +
            $"Процент: {context.DiscountPercentage}%\n" +
            $"Сумма: {context.DiscountAmount:N0}₽"
        );
    }
}
```


***

## **✅ 7. ФИНАЛИЗАЦИЯ ПРИ ЗАКРЫТИИ ЧЕКА**

```csharp
private async void OnOrderClosed(object sender, OrderClosedEventArgs e)
{
    var context = GetOrderLoyaltyContext(e.Order);
    
    if (context == null)
    {
        // Нет лояльности на этом заказе
        return;
    }
    
    logger.LogInformation(
        "Order closed with loyalty: OrderId={OrderId}, Type={Type}, Action={Action}",
        e.Order.Id,
        context.BenefitType,
        context.Action
    );
    
    try
    {
        // Финализируем в зависимости от типа
        if (context.BenefitType == BenefitType.Points)
        {
            await FinalizePointsOrder(e.Order, context);
        }
        else if (context.BenefitType == BenefitType.Discount)
        {
            await FinalizeDiscountOrder(e.Order, context);
        }
        
        logger.LogInformation("Loyalty finalized successfully");
        
        metricsService.RecordMetric("loyalty.order.finalized", 1);
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Failed to finalize loyalty");
        
        // Добавляем в offline queue
        offlineQueue.EnqueueOperation(new OfflineOperation
        {
            Type = "FINALIZE",
            Context = context,
            OrderId = e.Order.Id.ToString(),
            QueuedAt = DateTime.UtcNow
        });
        
        metricsService.RecordMetric("loyalty.offline_queued", 1);
    }
    finally
    {
        // Очищаем контекст
        ClearOrderLoyaltyContext(e.Order);
    }
}

private async Task FinalizePointsOrder(IOrder order, LoyaltyContext context)
{
    // Получаем финальные данные заказа
    var finalCheckAmount = order.GetTotalAmount();
    var payments = order.GetPayments();
    
    // Находим наш payment (могла измениться сумма)
    var loyaltyPayment = payments.FirstOrDefault(p => 
        p.PaymentType.Name == "MAX_LOYALTY_POINTS"
    );
    
    var finalPointsSpent = loyaltyPayment?.Sum ?? context.PointsToSpend;
    
    await apiClient.FinalizePointsAsync(new FinalizePointsRequest
    {
        GuestCardId = context.GuestCardId,
        OrderId = order.Id.ToString(),
        ReservationId = context.ReservationId,
        CheckAmount = context.OriginalCheckAmount,
        FinalCheckAmount = finalCheckAmount,
        PointsSpent = finalPointsSpent,
        PointsToEarn = context.PointsToEarn,
        Action = context.Action,
        PaymentTypes = payments.Select(p => p.PaymentType.Name).ToList(),
        CashierName = operations.GetCurrentUser()?.Name,
        OrderType = GetOrderType(order)
    });
}

private async Task FinalizeDiscountOrder(IOrder order, LoyaltyContext context)
{
    var finalCheckAmount = order.GetTotalAmount();
    var payments = order.GetPayments();
    
    await apiClient.FinalizeDiscountAsync(new FinalizeDiscountRequest
    {
        GuestCardId = context.GuestCardId,
        OrderId = order.Id.ToString(),
        ReservationId = context.ReservationId,
        CheckAmount = context.OriginalCheckAmount,
        FinalCheckAmount = finalCheckAmount,
        DiscountPercentage = context.DiscountPercentage,
        DiscountAmount = context.DiscountAmount,
        PaymentTypes = payments.Select(p => p.PaymentType.Name).ToList(),
        CashierName = operations.GetCurrentUser()?.Name,
        OrderType = GetOrderType(order)
    });
}
```


***

## **🔄 8. ОТВЯЗКА КАРТЫ**

```csharp
private async Task UnbindCard()
{
    var context = GetOrderLoyaltyContext(currentOrder);
    
    if (context == null)
    {
        ShowError("Нет привязанной карты");
        return;
    }
    
    try
    {
        ShowLoading("Отвязка карты...");
        
        // 1. Отменяем резервацию на backend
        await apiClient.CancelReservationAsync(new CancelReservationRequest
        {
            ReservationId = context.ReservationId,
            OrderId = currentOrder.Id.ToString(),
            Reason = "USER_UNBIND"
        });
        
        // 2. Удаляем payment из заказа
        if (context.BenefitType == BenefitType.Points)
        {
            var payment = currentOrder.Payments
                .FirstOrDefault(p => p.PaymentType.Name == "MAX_LOYALTY_POINTS");
            
            if (payment != null)
            {
                operations.DeletePayment(payment, currentOrder);
            }
        }
        else if (context.BenefitType == BenefitType.Discount)
        {
            var payment = currentOrder.Payments
                .FirstOrDefault(p => p.PaymentType.Name == "MAX_LOYALTY_DISCOUNT");
            
            if (payment != null)
            {
                operations.DeletePayment(payment, currentOrder);
            }
        }
        
        // 3. Очищаем контекст
        ClearOrderLoyaltyContext(currentOrder);
        
        HideLoading();
        
        metricsService.RecordMetric("loyalty.card.unbound", 1);
        
        ShowSuccess("✅ Карта отвязана");
        
        this.DialogResult = false;
        this.Close();
    }
    catch (Exception ex)
    {
        HideLoading();
        HandleError(ex);
    }
}
```


***

## **📡 9. BACKEND API**

### **9.1. Endpoints**

```typescript
// Поиск гостя
POST /api/pos-integration/iiko/search-guest
Body: { phone?: string, code6Digit?: string }
Response: { found: boolean, guest?: GuestInfo }

// Расчет бенефитов
POST /api/pos-integration/iiko/calculate
Body: { guestCardId, checkAmount, orderCategories, orderType }
Response: { benefitType, ...data }

// Резервация POINTS
POST /api/pos-integration/iiko/reserve-points
Body: { guestCardId, pointsToSpend, maxAllowed, checkAmount, orderId }
Response: { success, reservationId?, error? }

// Резервация DISCOUNT
POST /api/pos-integration/iiko/reserve-discount
Body: { guestCardId, discountPercentage, discountAmount, checkAmount, orderId }
Response: { success, reservationId?, error? }

// Обновление резервации (если payment изменен)
POST /api/pos-integration/iiko/update-reservation
Body: { reservationId, newAmount, oldAmount }
Response: { success }

// Отмена резервации
POST /api/pos-integration/iiko/cancel-reservation
Body: { reservationId, orderId, reason }
Response: { success }

// Финализация POINTS
POST /api/pos-integration/iiko/finalize-points
Body: { guestCardId, orderId, reservationId, pointsSpent, pointsToEarn, ... }
Response: { success, newBalance, transactionId }

// Финализация DISCOUNT
POST /api/pos-integration/iiko/finalize-discount
Body: { guestCardId, orderId, reservationId, discountAmount, ... }
Response: { success, transactionId }

// Конфигурация ресторана
GET /api/pos-integration/iiko/config
Response: { restaurantId, minCheckAmount, maxSpendPercentage, ... }

// Создание гостя с кассы
POST /api/pos-integration/iiko/create-guest
Body: { phone, name?, birthDate? }
Response: { success, guestCardId, code6Digit }

// Здоровье backend
GET /api/health
Response: { status: 'ok' }

// Время сервера
GET /api/system/time
Response: { serverTime: '2026-02-17T13:00:00Z' }

// Метрики (батч)
POST /api/pos-integration/iiko/metrics
Body: [ { name, value, tags, timestamp }, ... ]
Response: { received: true }
```


### **9.2. Аутентификация**

```
Header: X-API-Key: <encrypted_api_key>
Header: X-Plugin-Version: 1.0.0
Header: X-Restaurant-Id: <restaurant_id>
```


***

## **🔒 10. БЕЗОПАСНОСТЬ**

### **10.1. Шифрование API Key**

```csharp
public class EncryptionService
{
    // Шифруем API Key при установке
    public static string EncryptApiKey(string apiKey, string machineId)
    {
        using var aes = Aes.Create();
        aes.Key = DeriveKeyFromMachineId(machineId);
        aes.GenerateIV();
        
        var encrypted = aes.EncryptCbc(
            Encoding.UTF8.GetBytes(apiKey),
            aes.IV
        );
        
        return Convert.ToBase64String(aes.IV.Concat(encrypted).ToArray());
    }
    
    // Расшифровываем при загрузке
    public static string DecryptApiKey(string encryptedApiKey, string machineId)
    {
        var data = Convert.FromBase64String(encryptedApiKey);
        var iv = data.Take(16).ToArray();
        var encrypted = data.Skip(16).ToArray();
        
        using var aes = Aes.Create();
        aes.Key = DeriveKeyFromMachineId(machineId);
        aes.IV = iv;
        
        var decrypted = aes.DecryptCbc(encrypted, iv);
        return Encoding.UTF8.GetString(decrypted);
    }
    
    private static byte[] DeriveKeyFromMachineId(string machineId)
    {
        using var sha256 = SHA256.Create();
        return sha256.ComputeHash(Encoding.UTF8.GetBytes(machineId + "MaxLoyaltySalt"));
    }
}
```


### **10.2. Revoke API Key**

Backend может отозвать ключ:

```typescript
// При каждом запросе проверяем
const installation = await this.prisma.iikoPluginInstallation.findUnique({
  where: { apiKey: request.headers['x-api-key'] }
});

if (!installation || installation.status === 'REVOKED') {
  throw new UnauthorizedException('API Key revoked');
}
```


***

## **📴 11. OFFLINE РЕЖИМ**

### **11.1. Определение offline**

```csharp
public class HealthCheckService
{
    private bool isBackendHealthy = true;
    
    public async Task<HealthStatus> CheckHealthAsync()
    {
        try
        {
            var response = await httpClient.GetAsync(
                "/api/health",
                new CancellationTokenSource(TimeSpan.FromSeconds(2)).Token
            );
            
            isBackendHealthy = response.IsSuccessStatusCode;
        }
        catch
        {
            isBackendHealthy = false;
        }
        
        return isBackendHealthy 
            ? HealthStatus.Healthy 
            : HealthStatus.Offline;
    }
}
```


### **11.2. Offline queue**

```csharp
public class OfflineQueueService
{
    private readonly string queuePath;
    
    // Добавляем операцию в очередь
    public void EnqueueOperation(OfflineOperation operation)
    {
        var queue = LoadQueue();
        
        if (queue.Count >= 100)
        {
            throw new InvalidOperationException("Queue full");
        }
        
        operation.QueuedAt = DateTime.UtcNow;
        queue.Add(operation);
        
        SaveQueue(queue);
        
        logger.LogWarning(
            "Operation queued for offline processing: {Type}",
            operation.Type
        );
    }
    
    // Обрабатываем при восстановлении
    public async Task ProcessQueueAsync(LoyaltyApiClient apiClient)
    {
        var queue = LoadQueue();
        
        if (queue.Count == 0)
            return;
        
        logger.LogInformation(
            "Processing offline queue: {Count} operations",
            queue.Count
        );
        
        var processed = new List<OfflineOperation>();
        
        foreach (var operation in queue)
        {
            // Проверяем не устарела ли (24 часа)
            if (DateTime.UtcNow - operation.QueuedAt > TimeSpan.FromHours(24))
            {
                logger.LogWarning("Operation expired: {Id}", operation.Id);
                processed.Add(operation);
                continue;
            }
            
            try
            {
                // Отправляем на backend
                if (operation.Type == "FINALIZE")
                {
                    await apiClient.FinalizePointsAsync(operation.Context);
                }
                
                processed.Add(operation);
                logger.LogInformation("Processed: {Id}", operation.Id);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to process: {Id}", operation.Id);
            }
        }
        
        // Удаляем обработанные
        queue.RemoveAll(op => processed.Contains(op));
        SaveQueue(queue);
        
        if (processed.Count > 0)
        {
            MessageBox.Show(
                $"Обработано {processed.Count} операций из очереди оффлайн-режима",
                "Синхронизация завершена",
                MessageBoxButton.OK,
                MessageBoxImage.Information
            );
        }
    }
}
```


### **11.3. Ограничения в offline**

```
✅ Можно:
- Только начисление (EarnOnly)
- Операции идут в queue

❌ Нельзя:
- Списание баллов
- Применение скидки
```


***

## **📊 12. ЛОГИРОВАНИЕ И МОНИТОРИНГ**

### **12.1. Serilog**

```csharp
Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()
    .Enrich.WithProperty("Plugin", "MaxLoyaltyIiko")
    .Enrich.WithProperty("Version", GetPluginVersion())
    .Enrich.WithProperty("RestaurantId", restaurantConfig.RestaurantId)
    .Enrich.WithMachineName()
    .WriteTo.File(
        path: Path.Combine(AppData, "logs", "plugin-.log"),
        rollingInterval: RollingInterval.Day,
        retainedFileCountLimit: 7
    )
    .CreateLogger();
```


### **12.2. Метрики**

```csharp
// Отправляем на backend каждые 5 минут
metricsService.RecordMetric("loyalty.points.applied", pointsSpent);
metricsService.RecordMetric("loyalty.discount.applied", discountAmount);
metricsService.RecordMetric("loyalty.search.duration_ms", duration);
metricsService.RecordMetric("loyalty.error.network", 1);
metricsService.RecordMetric("loyalty.offline_queue.size", queueSize);
```


***

## **🎛️ 13. ДИАГНОСТИКА**

**Горячая клавиша:** `Ctrl+Shift+D`

```
┌──────────────────────────────────────────┐
│ Диагностика Max Loyalty                  │
├──────────────────────────────────────────┤
│ [Общее] [Тесты] [Логи] [Конфигурация]   │
├──────────────────────────────────────────┤
│                                          │
│ Версия: 1.0.0                            │
│ Ресторан: Пиццерия "У Марио"            │
│ API URL: https://api.maxloyalty.ru      │
│ Статус: 🟢 Подключено                   │
│                                          │
│ Хранилище: 12.5 MB / 50 MB              │
│ Offline очередь: 0 операций             │
│ Кеш: 45 записей                          │
│                                          │
│ [Запустить тесты]                        │
│ [Скопировать отчет для поддержки]       │
│                                          │
└──────────────────────────────────────────┘
```


***

## **🔄 14. ОБНОВЛЕНИЕ ПЛАГИНА**

```csharp
// Проверка обновлений каждые 24 часа
private async Task CheckForUpdatesAsync()
{
    var response = await apiClient.GetAsync<UpdateInfo>(
        "/api/pos-integration/iiko/latest-version"
    );
    
    var currentVersion = GetPluginVersion();
    
    if (response.LatestVersion > currentVersion)
    {
        var result = MessageBox.Show(
            $"Доступна новая версия плагина: {response.LatestVersion}\n\n" +
            $"Changelog:\n{response.Changelog}\n\n" +
            $"Обновить сейчас?",
            "Обновление",
            MessageBoxButton.YesNo
        );
        
        if (result == MessageBoxResult.Yes)
        {
            // Скачиваем installer
            var installerPath = await DownloadInstallerAsync(response.DownloadUrl);
            
            // Запускаем installer
            Process.Start(installerPath);
            
            // Закрываем iiko
            Application.Current.Shutdown();
        }
    }
}
```


***

## **🎯 15. ИТОГОВАЯ СХЕМА**

```
┌──────────────────────────────────────────────────────┐
│                  iiko FRONT                          │
│  ┌────────────────────────────────────────────────┐  │
│  │ Заказ #122463                                  │  │
│  │ Товары: Пицца 500₽ + Напиток 100₽ = 600₽     │  │
│  │                                                │  │
│  │ [Оплата] [Гости] [ДОПОЛНЕНИЯ] ← КНОПКА       │  │
│  └────────────────────────────────────────────────┘  │
│           ▼ Нажимаем "ДОПОЛНЕНИЯ"                    │
│  ┌────────────────────────────────────────────────┐  │
│  │ Выберите операцию:                             │  │
│  │ • DxBx: Маркированные товары                   │  │
│  │ • E&S оплаты                                   │  │
│  │ • Premium Bonus                                │  │
│  │ • Max Loyalty  ← ВЫБИРАЕМ                     │  │
│  └────────────────────────────────────────────────┘  │
│           ▼                                          │
│  ┌────────────────────────────────────────────────┐  │
│  │ MAX LOYALTY - Поиск гостя                      │  │
│  │ [+7 999 123 4567]                              │  │
│  │ [OK] [Отмена] [Создать]                        │  │
│  └────────────────────────────────────────────────┘  │
│           ▼ Backend: Calculate                       │
│  ┌────────────────────────────────────────────────┐  │
│  │ Операция (POINTS или DISCOUNT)                 │  │
│  │ Баланс: 2,450₽                                 │  │
│  │ Списать: [178₽]                                │  │
│  │ [Начислить] [Списать] [Отвязать]              │  │
│  └────────────────────────────────────────────────┘  │
│           ▼ Reserve на backend                       │
│           ▼ AddPreliminaryPayment                    │
│  ┌────────────────────────────────────────────────┐  │
│  │ СТРАНИЦА ОПЛАТЫ                                │  │
│  │ К ОПЛАТЕ: 600₽                                 │  │
│  │                                                │  │
│  │ ✅ Max Loyalty - Баллы: [178₽] ✏️            │  │
│  │ 💵 НАЛИЧНЫЕ: [422₽]                           │  │
│  │                                                │  │
│  │ [ЗАВЕРШИТЬ ОПЛАТУ]                             │  │
│  └────────────────────────────────────────────────┘  │
│           ▼ OrderClosed event                        │
│           ▼ Finalize на backend                      │
│  ✅ Списано 178₽ баллов                             │
│  ✅ Начислено +30 баллов                            │
└──────────────────────────────────────────────────────┘
```


***

## **✅ ЧЕКЛИСТ ФУНКЦИОНАЛЬНОСТИ**

### **Основные функции:**

- ✅ Поиск гостя по телефону/6-digit коду
- ✅ Создание нового гостя с кассы
- ✅ Поддержка POINTS (накопительная)
- ✅ Поддержка DISCOUNT (скидочная)
- ✅ Editable payment для баллов
- ✅ Non-editable payment для скидки
- ✅ Только начисление (EarnOnly)
- ✅ Отвязка карты
- ✅ Резервация + Финализация
- ✅ Обработка изменений payment


### **Безопасность:**

- ✅ Шифрование API Key
- ✅ Machine-binding
- ✅ Revoke через backend
- ✅ HTTPS only


### **Offline режим:**

- ✅ Определение offline
- ✅ Queue для операций
- ✅ Автосинхронизация
- ✅ Ограничения (только EarnOnly)


### **Мониторинг:**

- ✅ Структурированные логи
- ✅ Метрики на backend
- ✅ Диагностический экран
- ✅ Health checks


### **UX:**

- ✅ Цифровая клавиатура
- ✅ Loading индикаторы
- ✅ Понятные ошибки
- ✅ Подтверждения действий


### **DevOps:**

- ✅ Персональный installer
- ✅ Автообновления
- ✅ Uninstaller
- ✅ Ротация логов (7 дней)
- ✅ Лимит хранилища (50MB)

***

## **📋 ИТОГО**

**Плагин готов к разработке!**

Все что нужно:

1. ✅ Архитектура определена
2. ✅ UI/UX спроектирован
3. ✅ API endpoints описаны
4. ✅ Безопасность продумана
5. ✅ Offline режим реализован
6. ✅ Мониторинг настроен

