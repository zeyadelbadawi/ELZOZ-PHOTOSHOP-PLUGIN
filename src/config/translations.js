'use client';

// Complete professional translations for Elzoz Studio - English & Arabic (RTL Ready)
export const translations = {
    en: {
        // Header & Navigation
        header: {
            title: 'Elzoz Studio',
            subtitle: 'Batch Photo Design Automation',
            credits: 'Credits',
            logout: 'Logout',
            language: 'Language'
        },

        // Login Panel
        login: {
            title: 'Welcome to Elzoz Studio',
            subtitle: 'Batch Photo Design Automation',
            description: 'Transform your photo design workflow with powerful batch automation. Design faster, smarter, better.',
            email: 'Email Address',
            emailPlaceholder: 'Enter your email',
            password: 'Password',
            passwordPlaceholder: 'Enter your password',
            loginBtn: 'Sign In',
            loggingIn: 'Signing in...',
            errorMessage: 'Invalid email or password',
            forgotPassword: 'Forgot Password?',
            noAccount: 'Don\'t have an account?'
        },

        // Tabs
        tabs: {
            setup: 'Setup',
            mapping: 'Text Mapping',
            imageMapping: 'Image Mapping',
            images: 'Images',
            execute: 'Execute',
            analytics: 'Analytics',
            videoSetup: 'Setup',
            videoLayerMapping: 'Layer Mapping',
            videoAnimation: 'Animation',
            videoExecute: 'Execute'
        },

        // Mapping Panel
        mapping: {
            title: 'Column Mapping',
            description: 'Map Excel columns to PSD text layers',
            noTextLayers: 'No Text Layers Found',
            noTextLayersDesc: 'Your PSD file doesn\'t contain any TEXT layers. Only text layers can be automatically updated with data.',
            foundNonText: 'Found',
            howToFix: 'How to Fix Your Template',
            step1: 'Open your PSD file in Photoshop',
            step2: 'Create a NEW TEXT LAYER for each field you want to populate',
            step3: 'Name layers clearly (e.g., "Product Name", "Price", "Email")',
            step4: 'Position and style text as desired',
            step5: 'Save and re-import the PSD in Elzoz',
            step6: 'Map Excel columns to your new text layers',
            smartObjects: 'Smart Objects?',
            smartObjectsDesc: 'Image insertion for smart objects is coming in Phase 4. For now, use text layers for data that needs to be updated automatically.',
            textLayersOnly: 'Text Layers Only',
            textLayersOnlyDesc: 'Only text layers can be mapped.',
            nonTextLayersAvailable: 'non-text layers (groups, smart objects, etc.) are available but cannot be automatically updated with data.',
            excelColumns: 'Excel Columns',
            textLayers: 'Text Layers',
            noTextLayersTitle: 'No Text Layers',
            noTextLayersDesc2: 'Add text layers to your PSD to enable data mapping.',
            createMapping: 'Create Mapping',
            selectColumn: 'Select Column',
            selectTextLayer: 'Select Text Layer',
            chooseColumn: 'Choose a column...',
            chooseTextLayer: 'Choose a text layer...',
            noTextLayersAvailableSelect: 'No text layers available',
            textLayerCheckmark: 'Text Layer ✓',
            addMapping: 'Add Mapping',
            currentMappings: 'Current Mappings',
            remove: 'Remove'
        },

        // Image Mapping Panel
        imageMapping: {
            title: 'Image Layer Mapping',
            description: 'Configure Image Sources',
            mapImageLayersToData: 'Map Image Layers to Data',
            mapImageLayersDesc: 'Configure which layer gets images from which folder, and which Excel column contains the image filenames.',
            addMapping: 'Add Mapping',
            selectLayer: 'Select Layer',
            chooseImageLayer: 'Choose an image layer...',
            smartObject: 'Smart Object',
            raster: 'Raster',
            folderName: 'Folder Name (where images are stored)',
            chooseFolderLabel: 'Choose a folder...',
            selectFromSetupTab: 'Select from folders configured in the Setup tab',
            columnWithImageFilenames: 'Column with Image Filenames',
            chooseColumnLabel: 'Choose a column...',
            columnContainsImageFilenames: 'This column should contain image filenames (e.g., product-001.jpg)',
            activeMappings: 'Active Mappings',
            noMappingsYet: 'No Mappings Yet',
            addMappingsAbove: 'Add mappings above to connect image layers with Excel data',
            noImageLayers: 'No Image Layers',
            selectPSDWithImageLayers: 'Go to Setup tab and select a PSD with image layers (smart objects or raster layers).',
            folder: 'Folder',
            column: 'Column'
        },

        // Execute Panel
        execute: {
            title: 'Batch Execute',
            description: 'Generate designs from your data',
            setupIncomplete: 'Setup Incomplete',
            completeSetupFirst: 'Complete the Setup and Mapping tabs first to enable batch processing.',
            noExcelFile: 'Setup Required',
            preflight: 'Run Preflight Check',
            startProcessing: 'Start Processing',
            processing: 'Processing...',
            itemsToProcess: 'Items to Process',
            creditsRequired: 'Credits Required',
            skipImages: 'Skip Image Insertion',
            exportFormats: 'Export Formats',
            processingResults: 'Processing Results',
            successful: 'Successful',
            failed: 'Failed'
        },

        // Analytics Panel
        analytics: {
            title: 'Analytics Dashboard',
            totalDesigns: 'Total Designs',
            designsGenerated: 'designs generated',
            creditsUsed: 'Credits Used',
            totalCredits: 'total credits',
            remaining: 'Remaining',
            creditsAvailable: 'credits available',
            successRate: 'Success Rate',
            completionRate: 'completion rate',
            processingHistory: 'Processing History',
            noHistory: 'No History Yet',
            startBatchJob: 'Start a batch job to see your processing history and detailed analytics.',
            batch: 'Batch',
            items: 'items',
            credit: 'credit',
            totalBatches: 'Total Batches'
        },

        // Setup Panel
        setup: {
            title: 'Project Setup',
            description: 'Upload your Excel file to get started',
            selectExcel: 'Upload Excel File',
            dragDrop: 'Drag and drop your Excel file here',
            excelInfo: 'Select your Excel file containing design data with all the information you need for batch processing',
            selectedFile: 'Selected File:',
            fileName: 'File Name',
            rowsDetected: 'rows detected',
            columnsDetected: 'columns',
            fileSize: 'File Size',
            uploadDate: 'Upload Date',
            changeFile: 'Change File',
            selectColumns: 'Select Columns',
            configureColumns: 'Configure which columns contain your design data',
            exportFolder: 'Export Folder (for designs)',
            designsSaveHere: 'Designs will be saved here',
            nextSteps: 'Next Steps',
            step1AllFilesRequired: 'All 3 files are required to continue',
            step2ExcelData: 'Excel should contain product data in columns',
            step3PSDTemplate: 'PSD template should have text/image layers to map',
            step4Mapping: 'Go to Mapping tab to connect Excel columns to PSD layers',
            layersFound: 'layers found',
            detectedImageLayers: 'Detected Image Layers',
            imageLayers: 'image layers',
            folderSelected: 'Folder selected',
            selectFolderForImages: 'Select folder for this layer\'s images',
            selectFolderButton: 'Select Folder',
            changeFolderButton: 'Change Folder'
        },

        // Images Panel
        images: {
            title: 'Images Gallery',
            description: 'View and manage your images',
            totalImages: 'Total Images',
            filters: 'Filters',
            sort: 'Sort',
            sortBy: 'Sort By:',
            sortName: 'Name',
            sortSize: 'Size',
            sortDate: 'Modified Date',
            noImages: 'No images found',
            uploadMoreImages: 'Upload More Images',
            selectAll: 'Select All',
            deselectAll: 'Deselect All',
            delete: 'Delete',
            deleteConfirm: 'Are you sure you want to delete these images?'
        },

        // Execute Panel
        execute: {
            title: 'Execute Batch Processing',
            description: 'Run your batch design automation',
            runPreflight: '✓ Run Preflight Check',
            processing: 'Processing...',
            processComplete: 'Processing complete!',
            designsProcessed: 'designs processed successfully',
            preflightCheckRunning: 'Running preflight check...',

            // Insufficient Credits
            insufficientCredits: '⚠️ Insufficient Credits',
            creditsNeeded: 'You have',
            creditsLabel: 'credit',
            creditsPlural: 'credits',
            creditsBut: 'but you need',
            toExecute: 'to execute this batch.',
            contactUs: 'Contact us to purchase credits and unlock execution capabilities.',
            callBtn: '📞 Call to Purchase Credits',

            // Processing Messages
            validating: 'Validating design configuration...',
            checkingImages: 'Checking image files...',
            preparingDesigns: 'Preparing designs for processing...',
            processingDesigns: 'Processing designs...',
            savingResults: 'Saving results...',

            // Error Messages
            noExcelFile: 'Please upload an Excel file first',
            noMappings: 'Please configure data mappings first',
            noImageMappings: 'Please configure image mappings first',
            missingFiles: 'Some image files are missing',
            processingError: 'An error occurred during processing',

            // Results
            results: 'Results',
            successRate: 'Success Rate',
            downloadResults: 'Download Results',
            viewDetails: 'View Details'
        },

        // No Credits Overlay
        noCredits: {
            title: 'No Credits Available',
            lockMessage: 'This feature is locked',
            message: 'Your account has no credits remaining.',
            subtitle: 'To continue using Elzoz Studio and access all features, please contact us to purchase credits.',
            callBtn: '📞 Call to Charge Credits',
            businessHours: 'Business Hours: 9 AM - 6 PM (UTC+2)',
            contactEmail: 'Email: support@elzoz.com',
            contactPhone: 'Phone: +1 (234) 567-8900'
        },

        // Preflight Report
        preflight: {
            title: 'Preflight Check Report',
            checkPassed: 'Preflight Check Passed',
            checkIssuesFound: 'Preflight Check - Issues Found',
            noImageMappings: 'No image mappings configured',
            issuesFound: 'issue(s) found',
            rowsToProcess: 'Rows to Process',
            imageMappings: 'Image Mappings',
            issuesFoundCount: 'Issues Found',
            folderAnalysis: 'Folder Analysis',
            allFilesOk: 'All files OK',
            missing: 'Missing',
            available: 'Available',
            affectsRows: 'Affects rows',
            allGoodExecute: 'All Good - Execute',
            fixFilesFirst: 'Fix Files First',
            skipImagesExecute: 'Skip Images & Execute',
            cancel: 'Cancel',
            status: 'Status',
            validDesign: 'Design is valid and ready for execution',
            issues: 'issues found',
            warnings: 'warnings detected',
            skipImages: 'Skip Images & Execute',
            proceed: 'Proceed with Execution',
            close: 'Close',
            excelFile: 'Excel File',
            dataMapping: 'Data Mapping',
            imageMapping: 'Image Mapping',
            imageFiles: 'Image Files',
            designTemplate: 'Design Template',
            checking: 'Checking...',
            valid: 'Valid',
            invalid: 'Invalid',
            warning: 'Warning'
        },

        // Common
        common: {
            loading: 'Loading...',
            error: 'Error',
            success: 'Success',
            warning: 'Warning',
            cancel: 'Cancel',
            save: 'Save',
            continue: 'Continue',
            back: 'Back',
            next: 'Next',
            submit: 'Submit',
            close: 'Close',
            delete: 'Delete',
            edit: 'Edit',
            add: 'Add',
            update: 'Update',
            refresh: 'Refresh',
            retry: 'Retry',
            tryAgain: 'Try Again',
            select: 'Select',
            search: 'Search',
            filter: 'Filter',
            sort: 'Sort',
            export: 'Export',
            import: 'Import',
            clear: 'Clear',
            reset: 'Reset',
            apply: 'Apply',
            no: 'No',
            yes: 'Yes',
            ok: 'OK',
            pleaseWait: 'Please wait...',
            loadingData: 'Loading data...',
            errorOccurred: 'An error occurred. Please try again.',
            successMessage: 'Operation completed successfully!',
            requiredField: 'This field is required',
            preview: 'Data Preview',
            more: 'more',
            details: 'Details',
            successful: 'Successful',
            failed: 'Failed',
            average: 'Average',
            account: 'Account Information',
            accountName: 'Account Name',
            memberSince: 'Member Since',
            credit: 'credit',
            credits: 'credits'
        },

        // Status Messages
        status: {
            pending: 'Pending',
            processing: 'Processing',
            completed: 'Completed',
            failed: 'Failed',
            cancelled: 'Cancelled',
            paused: 'Paused',
            ready: 'Ready'
        }
    },

    ar: {
        // Header & Navigation
        header: {
            title: 'استوديو إلزوز',
            subtitle: 'أتمتة تصميم الصور الدفعي',
            credits: 'الرصيد',
            logout: 'تسجيل الخروج',
            language: 'اللغة'
        },

        // Login Panel
        login: {
            title: 'أهلاً وسهلاً بك في استوديو إلزوز',
            subtitle: 'أتمتة تصميم الصور الدفعي',
            description: 'حول سير عمل تصميم الصور الخاص بك من خلال أتمتة قوية وشاملة. صمّم بشكل أسرع وأذكى وأفضل.',
            email: 'عنوان البريد الإلكتروني',
            emailPlaceholder: 'أدخل بريدك الإلكتروني',
            password: 'كلمة المرور',
            passwordPlaceholder: 'أدخل كلمة المرور',
            loginBtn: 'دخل',
            loggingIn: 'جاري تسجيل الدخول...',
            errorMessage: 'بيانات الدخول غير صحيحة',
            forgotPassword: 'هل نسيت كلمة المرور؟',
            noAccount: 'ليس لديك حساب؟'
        },

        // Tabs
        tabs: {
            setup: 'الإعداد',
            mapping: 'الربط النصي',
            imageMapping: 'ربط الصور',
            images: 'الصور',
            execute: 'التنفيذ',
            analytics: 'التحليلات',
            videoSetup: 'الإعداد',
            videoLayerMapping: 'ربط الطبقات',
            videoAnimation: 'الرسوم المتحركة',
            videoExecute: 'التنفيذ'
        },

        // Mapping Panel
        mapping: {
            title: 'ربط الأعمدة',
            description: 'ربط أعمدة Excel بطبقات النصوص في PSD',
            noTextLayers: 'لم يتم العثور على طبقات نصية',
            noTextLayersDesc: 'لا يحتوي ملف PSD الخاص بك على أي طبقات نصية. يمكن تحديث طبقات النصوص فقط تلقائياً ببيانات.',
            foundNonText: 'تم العثور على',
            howToFix: 'كيفية إصلاح القالب الخاص بك',
            step1: 'افتح ملف PSD في Photoshop',
            step2: 'قم بإنشاء طبقة نصية جديدة لكل حقل تريد ملؤه',
            step3: 'اسم الطبقات بوضوح (مثل "اسم المنتج" و "السعر" و "البريد الإلكتروني")',
            step4: 'ضع النص وأسلوبه كما تريد',
            step5: 'احفظ وأعد استيراد PSD في Elzoz',
            step6: 'ربط أعمدة Excel بطبقات النصوص الجديدة الخاصة بك',
            smartObjects: 'الكائنات الذكية؟',
            smartObjectsDesc: 'إدراج الصور للكائنات الذكية قادم في المرحلة 4. في الوقت الحالي، استخدم طبقات النصوص للبيانات التي تحتاج إلى التحديث التلقائي.',
            textLayersOnly: 'طبقات النصوص فقط',
            textLayersOnlyDesc: 'يمكن ربط طبقات النصوص فقط.',
            nonTextLayersAvailable: 'طبقات غير نصية (مجموعات وكائنات ذكية وما إلى ذلك) متاحة لكن لا يمكن تحديثها تلقائياً ببيانات.',
            excelColumns: 'أعمدة Excel',
            textLayers: 'طبقات النصوص',
            noTextLayersTitle: 'لا توجد طبقات نصية',
            noTextLayersDesc2: 'أضف طبقات نصية إلى PSD الخاص بك لتفعيل ربط البيانات.',
            createMapping: 'إنشاء ربط',
            selectColumn: 'حدد العمود',
            selectTextLayer: 'حدد طبقة نصية',
            chooseColumn: 'اختر عمودًا...',
            chooseTextLayer: 'اختر طبقة نصية...',
            noTextLayersAvailableSelect: 'لا توجد طبقات نصية متاحة',
            textLayerCheckmark: 'طبقة نصية ✓',
            addMapping: 'إضافة ربط',
            currentMappings: 'الأربطة الحالية',
            remove: 'حذف'
        },

        // Image Mapping Panel
        imageMapping: {
            title: 'ربط طبقات الصور',
            description: 'تكوين مصادر الصور',
            mapImageLayersToData: 'ربط طبقات الصور بالبيانات',
            mapImageLayersDesc: 'قم بتكوين أي طبقة تحصل على صور من أي مجلد، وأي عمود Excel يحتوي على أسماء ملفات الصور.',
            addMapping: 'إضافة ربط',
            selectLayer: 'حدد الطبقة',
            chooseImageLayer: 'اختر طبقة صورة...',
            smartObject: 'كائن ذكي',
            raster: 'صورة نقطية',
            folderName: 'اسم المجلد (حيث يتم تخزين الصور)',
            chooseFolderLabel: 'اختر مجلدًا...',
            selectFromSetupTab: 'حدد من المجلدات المكونة في علامة تبويب الإعداد',
            columnWithImageFilenames: 'العمود الذي يحتوي على أسماء ملفات الصور',
            chooseColumnLabel: 'اختر عمودًا...',
            columnContainsImageFilenames: 'يجب أن يحتوي هذا العمود على أسماء ملفات الصور (مثل product-001.jpg)',
            activeMappings: 'الأربطة النشطة',
            noMappingsYet: 'لا توجد أربطة حتى الآن',
            addMappingsAbove: 'أضف أربطة أعلاه لربط طبقات الصور ببيانات Excel',
            noImageLayers: 'لا توجد طبقات صور',
            selectPSDWithImageLayers: 'انتقل إلى علامة تبويب الإعداد واختر PSD يحتوي على طبقات صور (كائنات ذكية أو طبقات صورة نقطية).',
            folder: 'المجلد',
            column: 'العمود'
        },

        // Execute Panel
        execute: {
            title: 'تنفيذ دفعي',
            description: 'إنشاء تصاميم من بيانات Excel',
            setupIncomplete: 'الإعداد غير مكتمل',
            completeSetupFirst: 'أكمل علامات التبويب الإعداد والربط أولاً لتفعيل معالجة الدفعة.',
            noExcelFile: 'إعداد مطلوب',
            preflight: 'تشغيل فحص ما قبل الرحلة',
            startProcessing: 'ابدأ المعالجة',
            processing: 'جاري المعالجة...',
            itemsToProcess: 'عناصر للمعالجة',
            creditsRequired: 'الرصيد المطلوب',
            skipImages: 'تخطي إدراج الصور',
            exportFormats: 'تنسيقات التصدير',
            processingResults: 'نتائج المعالجة',
            successful: 'نجح',
            failed: 'فشل'
        },

        // Analytics Panel
        analytics: {
            title: 'لوحة معلومات التحليلات',
            totalDesigns: 'إجمالي التصاميم',
            designsGenerated: 'تصميم تم إنشاؤه',
            creditsUsed: 'الرصيد المستخدم',
            totalCredits: 'إجمالي الرصيد',
            remaining: 'المتبقي',
            creditsAvailable: 'رصيد متاح',
            successRate: 'معدل النجاح',
            completionRate: 'معدل الإنجاز',
            processingHistory: 'سجل المعالجة',
            noHistory: 'لا يوجد سجل حتى الآن',
            startBatchJob: 'ابدأ مهمة دفعية لعرض سجل المعالجة والتحليلات التفصيلية.',
            batch: 'دفعة',
            items: 'عناصر',
            credit: 'رصيد',
            totalBatches: 'إجمالي الدفعات'
        },

        // Setup Panel
        setup: {
            title: 'إعداد المشروع',
            description: 'قم بتحميل ملف Excel الخاص بك للبدء',
            selectExcel: 'تحميل ملف Excel',
            dragDrop: 'اسحب وأفلت ملف Excel هنا',
            excelInfo: 'حدد ملف Excel الذي يحتوي على بيانات التصميم مع جميع المعلومات اللازمة لمعالجة الدفعية',
            selectedFile: 'الملف المحدد:',
            fileName: 'اسم الملف',
            rowsDetected: 'صفوف تم الكشف عنها',
            columnsDetected: 'أعمدة',
            fileSize: 'حجم الملف',
            uploadDate: 'تاريخ التحميل',
            changeFile: 'تغيير الملف',
            selectColumns: 'تحديد الأعمدة',
            configureColumns: 'تكوين الأعمدة التي تحتوي على بيانات التصميم',
            exportFolder: 'مجلد التصدير (للتصاميم)',
            designsSaveHere: 'سيتم حفظ التصاميم هنا',
            nextSteps: 'الخطوات التالية',
            step1AllFilesRequired: 'جميع الملفات الثلاثة مطلوبة للمتابعة',
            step2ExcelData: 'يجب أن يحتوي Excel على بيانات المنتج في الأعمدة',
            step3PSDTemplate: 'يجب أن يحتوي قالب PSD على طبقات نصية/صور للربط',
            step4Mapping: 'انتقل إلى علامة تبويب الربط لربط أعمدة Excel بطبقات PSD',
            layersFound: 'طبقات تم العثور عليها',
            detectedImageLayers: 'طبقات ��لصور المكتشفة',
            imageLayers: 'طبقات صور',
            folderSelected: 'تم تحديد المجلد',
            selectFolderForImages: 'حدد مجلد الصور لهذه الطبقة',
            selectFolderButton: 'تحديد المجلد',
            changeFolderButton: 'تغيير المجلد'
        },

        // Images Panel
        images: {
            title: 'معرض الصور',
            description: 'عرض وإدارة صورك',
            totalImages: 'إجمالي الصور',
            filters: 'عوامل التصفية',
            sort: 'ترتيب',
            sortBy: 'ترتيب حسب:',
            sortName: 'الاسم',
            sortSize: 'الحجم',
            sortDate: 'تاريخ التعديل',
            noImages: 'لم يتم العثور على صور',
            uploadMoreImages: 'تحميل المزيد من الصور',
            selectAll: 'تحديد الكل',
            deselectAll: 'إلغاء تحديد الكل',
            delete: 'حذف',
            deleteConfirm: 'هل تريد بالفعل حذف هذه الصور؟'
        },

        // Execute Panel
        execute: {
            title: 'تنفيذ المعالجة الدفعية',
            description: 'قم بتشغيل أتمتة تصميم الدفعة الخاصة بك',
            runPreflight: '✓ تشغيل فحص ما قبل الرحلة',
            processing: 'جاري المعالجة...',
            processComplete: 'اكتملت المعالجة!',
            designsProcessed: 'تم معالجة التصاميم بنجاح',
            preflightCheckRunning: 'جاري تشغيل فحص ما قبل الرحلة...',
            png: 'png',
            // Insufficient Credits
            insufficientCredits: '⚠️ رصيد غير كافي',
            creditsNeeded: 'لديك',
            creditsLabel: 'وحدة رصيد',
            creditsPlural: 'وحدات رصيد',
            creditsBut: 'لكنك تحتاج إلى',
            toExecute: 'للتنفيذ.',
            contactUs: 'اتصل بنا لشراء رصيد والوصول إلى جميع الميزات.',
            callBtn: '📞 اتصل لشراء الرصيد',
            notReady: 'غير مكتمل',
            exportSettings: 'الاعدادات',
            jpg: 'jpg',
            psd: 'psd',
            validating: 'جاري التحقق من تكوين التصميم...',
            checkingImages: 'جاري التحقق من ملفات الصور...',
            preparingDesigns: 'جاري إعداد التصاميم للمعالجة...',
            processingDesigns: 'جاري معالجة التصاميم...',
            savingResults: 'جاري حفظ النتائج...',
            processDesigns: 'تنفيذ',
            // Error Messages
            noExcelFile: 'يرجى تحميل ملف Excel أولاً',
            noMappings: 'يرجى تكوين ر��طات البيانات أولاً',
            noImageMappings: 'يرجى تكوين ربطات الصور أولاً',
            missingFiles: 'بعض ملفات الصور مفقودة',
            processingError: 'حدث خطأ أثناء المعالجة',

            // Results
            results: 'النتائج',
            successRate: 'معدل النجاح',
            downloadResults: 'تحميل النتائج',
            viewDetails: 'عرض التفاصيل'
        },

        // No Credits Overlay
        noCredits: {
            title: 'لا توجد وحدات رصيد متاحة',
            lockMessage: 'هذه الميزة مقفلة',
            message: 'حسابك لا يحتوي على أي وحدات رصيد متبقية.',
            subtitle: 'للمتابعة في استخدام استوديو إلزوز والوصول إلى جميع الميزات، يرجى الاتصال بنا لشراء وحدات رصيد.',
            callBtn: '📞 اتصل لشراء الرصيد',
            businessHours: 'ساعات العمل: 9 صباحاً - 6 مساءً (UTC+2)',
            contactEmail: 'البريد الإلكتروني: support@elzoz.com',
            contactPhone: 'الهاتف: +1 (234) 567-8900'
        },

        // Preflight Report
        preflight: {
            title: 'تقرير فحص ما قبل الرحلة',
            checkPassed: 'نجح فحص ما قبل الرحلة',
            checkIssuesFound: 'فحص ما قبل الرحلة - تم العثور على مشاكل',
            noImageMappings: 'لم يتم تكوين أي أربطة صور',
            issuesFound: 'مشكلة(مشاكل) تم العثور عليها',
            rowsToProcess: 'الصفوف المراد معالجتها',
            imageMappings: 'أربطة الصور',
            issuesFoundCount: 'المشاكل المكتشفة',
            folderAnalysis: 'تحليل المجلد',
            allFilesOk: 'جميع الملفات موافقة',
            missing: 'مفقود',
            available: 'متوفر',
            affectsRows: 'يؤثر على الصفوف',
            allGoodExecute: 'كل شيء تمام - تنفيذ',
            fixFilesFirst: 'إصلاح الملفات أولاً',
            skipImagesExecute: 'تجاوز الصور والتنفيذ',
            cancel: 'إلغاء',
            status: 'الحالة',
            validDesign: 'التصميم صحيح وجاهز للتنفيذ',
            issues: 'مشاكل تم العثور عليها',
            warnings: 'تحذيرات تم الكشف عنها',
            skipImages: 'تجاوز الصور والتنفيذ',
            proceed: 'متابعة التنفيذ',
            close: 'إغلاق',
            excelFile: 'ملف Excel',
            dataMapping: 'ربط البيانات',
            imageMapping: 'ربط الصور',
            imageFiles: 'ملفات الصور',
            designTemplate: 'قالب التصميم',
            checking: 'جاري الفحص...',
            valid: 'صحيح',
            invalid: 'غير صحيح',
            warning: 'تحذير'
        },

        // Common
        common: {
            loading: 'جاري التحميل...',
            error: 'خطأ',
            success: 'نجح',
            warning: 'تحذير',
            cancel: 'إلغاء',
            save: 'حفظ',
            continue: 'متابعة',
            back: 'رجوع',
            next: 'التالي',
            submit: 'إرسال',
            close: 'إغلاق',
            delete: 'حذف',
            edit: 'تعديل',
            add: 'إضافة',
            update: 'تحديث',
            refresh: 'تحديث',
            retry: 'إعادة محاولة',
            tryAgain: 'حاول مرة أخرى',
            select: 'حدد',
            search: 'بحث',
            filter: 'تصفية',
            sort: 'ترتيب',
            export: 'تصدير',
            import: 'استيراد',
            clear: 'مسح',
            reset: 'إعادة تعيين',
            apply: 'تطبيق',
            no: 'لا',
            yes: 'نعم',
            ok: 'حسناً',
            pleaseWait: 'يرجى الانتظار...',
            loadingData: 'جاري تحميل البيانات...',
            errorOccurred: 'حدث خطأ. يرجى المحاولة مرة أخرى.',
            successMessage: 'تمت العملية بنجاح!',
            requiredField: 'هذا الحقل مطلوب',
            preview: 'معاينة البيانات',
            more: 'أكثر',
            details: 'التفاصيل',
            successful: 'ناجح',
            failed: 'فشل',
            average: 'المتوسط',
            account: 'معلومات الحساب',
            accountName: 'اسم الحساب',
            memberSince: 'عضو منذ',
            credit: 'رصيد',
            credits: 'أرصدة'
        },

        // Status Messages
        status: {
            pending: 'قيد الانتظار',
            processing: 'جاري المعالجة',
            completed: 'مكتمل',
            failed: 'فشل',
            cancelled: 'تم الإلغاء',
            paused: 'موقوف مؤقتاً',
            ready: 'جاهز'
        }
    }
};

// Helper function to get translation
export const t = (language, path) => {
    const keys = path.split('.');
    let value = translations[language];

    for (const key of keys) {
        value = value?.[key];
    }

    return value || path;
};

export default translations;
