import * as THREE from 'three';
import { Reactive } from 'ivue';
import { Static } from 'ivue/extras';
import {
  getCurrentInstance,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  watch,
} from 'vue';
import type {
  InvariantSnapshot,
  LatticeComposition,
  RankedRecord,
  TimelineEventType,
  TimelineRecordEvent,
  TimelineTransition,
  VerificationMode,
} from '../types';

class $FieldView {
  protected threeDimensionalResources: ThreeDimensionalResources | null = null;
  protected resizeObserver: BrowserResizeObserver | null = null;
  protected animationFrameIdentifier: number | null = null;
  protected orbitPointerIdentifier: number | null = null;
  protected previousPointerX = 0;
  protected previousPointerY = 0;

  constructor(
    public props: FieldViewProps,
    public emit: FieldViewEmits,
  ) {
    if (getCurrentInstance()) {
      onMounted(() => this.mountThreeDimensionalField());
      onUnmounted(() => this.disposeThreeDimensionalField());
      watch(
        () => [
          this.props.snapshot,
          this.props.selectedRecordIdentifier,
          this.props.timelineTransition?.identifier,
          this.fieldMode.value,
        ],
        () => this.syncThreeDimensionalField(),
        { flush: 'post' },
      );
    }
  }

  // --- state ---
  get tooltip() {
    return shallowRef<FieldTooltip | null>(null);
  }
  get fieldMode() {
    return ref<FieldMode>(
      this.systemPrefersReducedMotion ? 'two-dimensional' : 'three-dimensional',
    );
  }
  get reducedMotion() {
    return ref(this.systemPrefersReducedMotion);
  }
  get threeDimensionalCanvas() {
    return ref<BrowserCanvasElement | null>(null);
  }
  get threeDimensionalHitTargets() {
    return shallowRef<ThreeDimensionalHitTarget[]>([]);
  }
  get cameraYawDegrees() {
    return ref(0);
  }
  get cameraPitchDegrees() {
    return ref(12);
  }

  // --- constants ---
  realityGlowRadius = 30;
  realityRadius = 8;

  // --- derived ---
  get fieldCenter() {
    return 380;
  }
  get fieldRadius() {
    return 320;
  }
  get rankRings() {
    return [0.22, 0.36, 0.52, 0.72, 1].map(
      (normalizedRadius) => normalizedRadius * this.fieldRadius,
    );
  }
  get snapshot() {
    return this.props.snapshot;
  }
  get selectedCompositionIdentifier() {
    return this.props.selectedCompositionIdentifier;
  }
  get timelineTransition() {
    return this.props.timelineTransition;
  }
  get isTwoDimensional() {
    return this.fieldMode.value === 'two-dimensional';
  }
  get isThreeDimensional() {
    return this.fieldMode.value === 'three-dimensional';
  }
  get twoDimensionalButtonClassName() {
    return this.isTwoDimensional ? 'field-mode-active' : '';
  }
  get threeDimensionalButtonClassName() {
    return this.isThreeDimensional ? 'field-mode-active' : '';
  }
  get fieldPanelClassName() {
    return [
      'field-panel',
      this.isTwoDimensional
        ? 'field-panel-two-dimensional'
        : 'field-panel-three-dimensional',
      this.timelineTransition ? 'field-panel-transitioning' : '',
      this.reducedMotion.value ? 'field-panel-reduced-motion' : '',
    ]
      .filter(Boolean)
      .join(' ');
  }
  get realityLabelY() {
    return this.fieldCenter - 18;
  }
  get selectedComposition(): LatticeComposition | null {
    return (
      this.snapshot.compositions.find(
        (composition) =>
          composition.identifier === this.props.selectedCompositionIdentifier,
      ) ?? null
    );
  }
  get compositionOptions() {
    return this.snapshot.compositions.map((composition) => ({
      identifier: composition.identifier,
      name: composition.name,
    }));
  }
  get fieldSectors() {
    const sectorWidthRadians =
      (Math.PI * 2) / this.constructorClass.DOMAIN_NAMES.length;
    return this.constructorClass.DOMAIN_NAMES.map((domainName, domainIndex) => {
      const startAngle = -Math.PI / 2 + domainIndex * sectorWidthRadians;
      const endAngle = startAngle + sectorWidthRadians;
      const labelAngle = startAngle + sectorWidthRadians / 2;
      const labelPoint = this.polarPoint(this.fieldRadius + 21, labelAngle);
      return {
        domainName,
        domainIndex,
        path: this.sectorPath(startAngle, endAngle),
        className: `domain-sector domain-sector-${domainIndex}`,
        label: domainName.toUpperCase(),
        labelX: labelPoint.x,
        labelY: labelPoint.y,
        labelTransform: `rotate(${(labelAngle * 180) / Math.PI + 90} ${labelPoint.x} ${labelPoint.y})`,
      };
    });
  }
  get transitionEventsByRecord() {
    const eventsByRecord = new Map<string, TimelineRecordEvent[]>();
    for (const timelineEvent of this.timelineTransition?.events ?? []) {
      const recordEvents =
        eventsByRecord.get(timelineEvent.recordIdentifier) ?? [];
      recordEvents.push(timelineEvent);
      eventsByRecord.set(timelineEvent.recordIdentifier, recordEvents);
    }
    return eventsByRecord;
  }
  get fieldDots(): FieldDot[] {
    const selectedMemberIdentifiers = new Set(
      this.selectedComposition?.memberIdentifiers ?? [],
    );
    const records = [...this.snapshot.records];
    for (const timelineEvent of this.timelineTransition?.events ?? []) {
      if (
        timelineEvent.type === 'removed' &&
        timelineEvent.beforeRecord &&
        !records.some(
          (record) =>
            record.stableIdentifier === timelineEvent.recordIdentifier,
        )
      ) {
        records.push(timelineEvent.beforeRecord);
      }
    }
    return records.map((record) => {
      const recordEvents =
        this.transitionEventsByRecord.get(record.stableIdentifier) ?? [];
      const domainIndex = this.domainIndex(record.domain);
      const angle = this.recordAngle(record, domainIndex);
      const point = this.polarPoint(record.radius * this.fieldRadius, angle);
      const beforeRecord =
        recordEvents.find((event) => event.beforeRecord)?.beforeRecord ??
        record;
      const previousRadius = recordEvents.some(
        (event) => event.type === 'birth',
      )
        ? this.fieldRadius
        : beforeRecord.radius * this.fieldRadius;
      const previousPoint = this.polarPoint(previousRadius, angle);
      const isSelected =
        this.props.selectedRecordIdentifier === record.stableIdentifier;
      const isCompositionMember = selectedMemberIdentifiers.has(
        record.stableIdentifier,
      );
      const hasActiveComposition = Boolean(
        this.props.selectedCompositionIdentifier,
      );
      const eventTypes = recordEvents.map((event) => event.type);
      return {
        identifier: record.stableIdentifier,
        record,
        x: point.x,
        y: point.y,
        previousX: previousPoint.x,
        previousY: previousPoint.y,
        traceStartX: previousPoint.x - point.x,
        traceStartY: previousPoint.y - point.y,
        labelX: point.x + 13,
        labelY: point.y - 10,
        labelKey: `label-${record.stableIdentifier}`,
        transform: `translate(${point.x} ${point.y})`,
        domainIndex,
        visualRadius: isSelected || isCompositionMember ? 6 : 4,
        accessibilityLabel: `${record.name}, rank ${record.rank.toFixed(3)}`,
        className: [
          'record-mark',
          `record-mark-${record.kind}`,
          `record-verification-${record.verificationMode}`,
          isSelected ? 'record-mark-selected' : '',
          hasActiveComposition && !isCompositionMember
            ? 'record-mark-muted'
            : '',
          isCompositionMember ? 'record-mark-composition' : '',
          ...eventTypes.map((eventType) => `record-event-${eventType}`),
        ]
          .filter(Boolean)
          .join(' '),
        traceClassName: [
          'record-event-trace',
          eventTypes.length > 0 ? 'record-event-trace-visible' : '',
        ]
          .filter(Boolean)
          .join(' '),
        style: {
          '--record-domain-color': `var(--color-domain-${this.constructorClass.DOMAIN_NAMES[domainIndex]})`,
          '--record-previous-x': `${previousPoint.x - point.x}px`,
          '--record-previous-y': `${previousPoint.y - point.y}px`,
        },
        eventTypes,
        isRealityAbsolute: record.kind === 'reality-absolute',
        isRealityRenegotiable: record.kind === 'reality-renegotiable',
        isChosen: record.kind === 'chosen',
        isSelected,
        hasTimelineEvent: eventTypes.length > 0,
        hasRot:
          record.rankComponents.rotPenalty > 0 || eventTypes.includes('rot'),
      };
    });
  }
  get tooltipStyle() {
    return {
      left: `${this.tooltip.value?.left ?? 0}px`,
      top: `${this.tooltip.value?.top ?? 0}px`,
    };
  }
  get transitionSummary() {
    const eventCounts = new Map<TimelineEventType, number>();
    for (const event of this.timelineTransition?.events ?? []) {
      eventCounts.set(event.type, (eventCounts.get(event.type) ?? 0) + 1);
    }
    return this.constructorClass.TIMELINE_EVENT_ORDER.map((eventType) => ({
      eventType,
      label: this.timelineEventLabel(eventType),
      count: eventCounts.get(eventType) ?? 0,
      className: `timeline-event-count timeline-event-count-${eventType}`,
    }));
  }
  get transitionSentinelClassName() {
    return this.reducedMotion.value
      ? 'timeline-transition-sentinel timeline-transition-sentinel-reduced'
      : 'timeline-transition-sentinel';
  }
  get cameraReadout() {
    return `YAW ${this.cameraYawDegrees.value.toFixed(0)}° · PITCH ${this.cameraPitchDegrees.value.toFixed(0)}°`;
  }
  protected get constructorClass() {
    return this.constructor as typeof $FieldView;
  }
  protected get systemPrefersReducedMotion() {
    return (
      this.browserWindow.matchMedia?.('(prefers-reduced-motion: reduce)')
        .matches ?? false
    );
  }

  // --- methods ---
  selectCompositionFromEvent(event: Event) {
    const select = event.currentTarget as EventTarget & { value: string };
    this.emit('select-composition', select.value);
  }

  selectRecord(recordIdentifier: string) {
    this.emit('cancel-timeline');
    this.emit('select-record', recordIdentifier);
  }

  selectTwoDimensionalMode() {
    this.emit('cancel-timeline');
    this.fieldMode.value = 'two-dimensional';
  }

  selectThreeDimensionalMode() {
    if (this.reducedMotion.value) return;
    this.emit('cancel-timeline');
    this.fieldMode.value = 'three-dimensional';
    this.browserWindow.queueMicrotask(() => this.syncThreeDimensionalField());
  }

  resetCamera() {
    this.emit('cancel-timeline');
    this.cameraYawDegrees.value = 0;
    this.cameraPitchDegrees.value = 12;
    this.renderThreeDimensionalField(true);
  }

  handleFieldKeydown(event: BrowserKeyboardEvent) {
    if (event.key === '2') {
      event.preventDefault();
      this.selectTwoDimensionalMode();
    } else if (event.key === '3') {
      event.preventDefault();
      this.selectThreeDimensionalMode();
    } else if (event.key === '0') {
      event.preventDefault();
      this.resetCamera();
    } else if (event.key === 'Escape') {
      this.emit('cancel-timeline');
      this.cancelThreeDimensionalAnimation();
    }
  }

  handleDotKeydown(event: BrowserKeyboardEvent, dot: FieldDot) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.selectRecord(dot.identifier);
      return;
    }
    const direction = this.directionForKey(event.key);
    if (!direction) return;
    event.preventDefault();
    const nearestDot = this.nearestDot(dot, direction);
    this.browserDocument
      .querySelector(`[data-record-identifier="${nearestDot.identifier}"]`)
      ?.focus();
  }

  showTooltip(event: Event, record: RankedRecord) {
    const stage = this.browserDocument.querySelector('.field-stage')!;
    const stageBounds = stage.getBoundingClientRect();
    const targetBounds = (
      event.currentTarget as EventTarget & BrowserElement
    ).getBoundingClientRect();
    this.tooltip.value = {
      name: record.name,
      contractPath: record.contractPath,
      rankAndRadius: `Rank ${record.rank.toFixed(3)} · radius ${record.radius.toFixed(3)}`,
      left: Math.min(
        stageBounds.width - 280,
        targetBounds.left - stageBounds.left + 14,
      ),
      top: Math.max(8, targetBounds.top - stageBounds.top - 72),
    };
  }

  showThreeDimensionalTooltip(
    event: BrowserPointerEvent,
    record: RankedRecord,
  ) {
    const stage = this.browserDocument.querySelector('.field-stage')!;
    const stageBounds = stage.getBoundingClientRect();
    this.tooltip.value = {
      name: record.name,
      contractPath: record.contractPath,
      rankAndRadius: `Rank ${record.rank.toFixed(3)} · radius ${record.radius.toFixed(3)}`,
      left: Math.min(
        stageBounds.width - 280,
        event.clientX - stageBounds.left + 14,
      ),
      top: Math.max(8, event.clientY - stageBounds.top - 72),
    };
  }

  hideTooltip() {
    this.tooltip.value = null;
  }

  settleTimelineTransition() {
    if (this.timelineTransition) {
      this.emit('transition-settled', this.timelineTransition.identifier);
    }
  }

  handleThreeDimensionalPointerDown(event: BrowserPointerEvent) {
    if (event.button !== 2) return;
    event.preventDefault();
    this.emit('cancel-timeline');
    this.orbitPointerIdentifier = event.pointerId;
    this.previousPointerX = event.clientX;
    this.previousPointerY = event.clientY;
    this.threeDimensionalCanvas.value?.setPointerCapture(event.pointerId);
  }

  handleThreeDimensionalPointerMove(event: BrowserPointerEvent) {
    if (this.orbitPointerIdentifier === event.pointerId) {
      const horizontalDelta = event.clientX - this.previousPointerX;
      const verticalDelta = event.clientY - this.previousPointerY;
      this.previousPointerX = event.clientX;
      this.previousPointerY = event.clientY;
      this.cameraYawDegrees.value = this.clamp(
        this.cameraYawDegrees.value + horizontalDelta * 0.18,
        -24,
        24,
      );
      this.cameraPitchDegrees.value = this.clamp(
        this.cameraPitchDegrees.value - verticalDelta * 0.14,
        0,
        12,
      );
      this.renderThreeDimensionalField(true);
      return;
    }
    this.pickThreeDimensionalRecord(event, false);
  }

  handleThreeDimensionalPointerUp(event: BrowserPointerEvent) {
    if (this.orbitPointerIdentifier !== event.pointerId) return;
    this.orbitPointerIdentifier = null;
    this.threeDimensionalCanvas.value?.releasePointerCapture(event.pointerId);
  }

  handleThreeDimensionalClick(event: BrowserPointerEvent) {
    if (event.button === 0) this.pickThreeDimensionalRecord(event, true);
  }

  preventContextMenu(event: Event) {
    event.preventDefault();
  }

  handleThreeDimensionalHitTargetFocus(event: Event, record: RankedRecord) {
    this.showTooltip(event, record);
  }

  protected mountThreeDimensionalField() {
    const canvas = this.threeDimensionalCanvas.value;
    if (!canvas) return;
    try {
      const renderer = new THREE.WebGLRenderer({
        canvas: canvas as unknown as ThreeDimensionalRendererCanvas,
        alpha: true,
        antialias: true,
      });
      renderer.setPixelRatio(
        Math.min(this.browserWindow.devicePixelRatio ?? 1, 2),
      );
      renderer.setClearAlpha(0);
      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2_000);
      const raycaster = new THREE.Raycaster();
      raycaster.params.Points = { threshold: 13 };
      this.threeDimensionalResources = {
        renderer,
        scene,
        camera,
        raycaster,
        points: null,
        dots: [],
        startPositions: new Float32Array(),
        targetPositions: new Float32Array(),
      };
      this.resizeObserver = new this.browserWindow.ResizeObserver(() =>
        this.renderThreeDimensionalField(true),
      );
      this.resizeObserver.observe(canvas);
      this.syncThreeDimensionalField();
    } catch {
      this.fieldMode.value = 'two-dimensional';
    }
  }

  protected disposeThreeDimensionalField() {
    this.cancelThreeDimensionalAnimation();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (!this.threeDimensionalResources) return;
    this.disposeScene(this.threeDimensionalResources.scene);
    this.threeDimensionalResources.renderer.dispose();
    this.threeDimensionalResources = null;
  }

  protected syncThreeDimensionalField() {
    if (!this.threeDimensionalResources || !this.isThreeDimensional) return;
    this.cancelThreeDimensionalAnimation();
    this.disposeScene(this.threeDimensionalResources.scene);
    this.threeDimensionalResources.scene.clear();
    this.addThreeDimensionalGrid();
    this.addThreeDimensionalRecords();
    this.renderThreeDimensionalField(true);
    if (this.timelineTransition) {
      this.animateThreeDimensionalTransition();
    }
  }

  protected addThreeDimensionalGrid() {
    const resources = this.threeDimensionalResources!;
    for (const ringRadius of this.rankRings) {
      const ringPoints = Array.from({ length: 129 }, (_, pointIndex) => {
        const angle = (pointIndex / 128) * Math.PI * 2;
        return new THREE.Vector3(
          Math.cos(angle) * ringRadius,
          Math.sin(angle) * ringRadius,
          0,
        );
      });
      const geometry = new THREE.BufferGeometry().setFromPoints(ringPoints);
      const material = new THREE.LineBasicMaterial({
        color: this.cssColor('color-field-grid'),
        transparent: true,
        opacity: 0.13,
      });
      resources.scene.add(new THREE.LineLoop(geometry, material));
    }
    const axisMaterial = new THREE.LineBasicMaterial({
      color: this.cssColor('color-field-axis'),
      transparent: true,
      opacity: 0.25,
    });
    for (let domainIndex = 0; domainIndex < 8; domainIndex++) {
      const angle = -Math.PI / 2 + (domainIndex * Math.PI) / 4;
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(
          Math.cos(angle) * this.fieldRadius,
          Math.sin(angle) * this.fieldRadius,
          0,
        ),
      ]);
      resources.scene.add(new THREE.Line(geometry, axisMaterial.clone()));
    }
  }

  protected addThreeDimensionalRecords() {
    const resources = this.threeDimensionalResources!;
    const dots = this.fieldDots;
    const startPositions = new Float32Array(dots.length * 3);
    const targetPositions = new Float32Array(dots.length * 3);
    const colors = new Float32Array(dots.length * 3);
    const recordKinds = new Float32Array(dots.length);
    const verificationModes = new Float32Array(dots.length);
    const selectedStates = new Float32Array(dots.length);
    const rotStates = new Float32Array(dots.length);
    const eventTypes = new Float32Array(dots.length);

    dots.forEach((dot, dotIndex) => {
      const targetPosition = this.threeDimensionalPosition(
        dot.x,
        dot.y,
        dot.domainIndex,
      );
      const startPosition = this.threeDimensionalPosition(
        dot.previousX,
        dot.previousY,
        dot.domainIndex,
      );
      targetPosition.toArray(targetPositions, dotIndex * 3);
      startPosition.toArray(startPositions, dotIndex * 3);
      const domainColor = new THREE.Color(
        this.cssColor(
          `color-domain-${this.constructorClass.DOMAIN_NAMES[dot.domainIndex]}`,
        ),
      );
      domainColor.toArray(colors, dotIndex * 3);
      recordKinds[dotIndex] = this.recordKindNumber(dot.record.kind);
      verificationModes[dotIndex] = this.verificationModeNumber(
        dot.record.verificationMode,
      );
      selectedStates[dotIndex] = dot.isSelected ? 1 : 0;
      rotStates[dotIndex] = dot.hasRot ? 1 : 0;
      eventTypes[dotIndex] = this.timelineEventNumber(dot.eventTypes);
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(startPositions.slice(), 3),
    );
    geometry.setAttribute('domainColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute(
      'recordKind',
      new THREE.BufferAttribute(recordKinds, 1),
    );
    geometry.setAttribute(
      'verificationMode',
      new THREE.BufferAttribute(verificationModes, 1),
    );
    geometry.setAttribute(
      'selectedState',
      new THREE.BufferAttribute(selectedStates, 1),
    );
    geometry.setAttribute('rotState', new THREE.BufferAttribute(rotStates, 1));
    geometry.setAttribute(
      'eventType',
      new THREE.BufferAttribute(eventTypes, 1),
    );
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        pointScale: { value: resources.renderer.getPixelRatio() },
        transitionProgress: { value: this.timelineTransition ? 0 : 1 },
        fieldColor: { value: new THREE.Color(this.cssColor('color-field')) },
        selectionColor: {
          value: new THREE.Color(this.cssColor('color-selection')),
        },
        focusColor: { value: new THREE.Color(this.cssColor('color-focus')) },
        rotColor: { value: new THREE.Color(this.cssColor('color-rot')) },
      },
      vertexShader: this.threeDimensionalVertexShader(),
      fragmentShader: this.threeDimensionalFragmentShader(),
    });
    const points = new THREE.Points(geometry, material);
    resources.scene.add(points);
    resources.points = points;
    resources.dots = dots;
    resources.startPositions = startPositions;
    resources.targetPositions = targetPositions;
  }

  protected renderThreeDimensionalField(updateHitTargets: boolean) {
    const resources = this.threeDimensionalResources;
    const canvas = this.threeDimensionalCanvas.value;
    if (!resources || !canvas || !this.isThreeDimensional) return;
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    resources.renderer.setSize(bounds.width, bounds.height, false);
    const halfHeight = this.fieldRadius * 1.12;
    const halfWidth = halfHeight * (bounds.width / bounds.height);
    resources.camera.left = -halfWidth;
    resources.camera.right = halfWidth;
    resources.camera.top = halfHeight;
    resources.camera.bottom = -halfHeight;
    resources.camera.updateProjectionMatrix();
    const yawRadians = THREE.MathUtils.degToRad(this.cameraYawDegrees.value);
    const pitchRadians = THREE.MathUtils.degToRad(
      this.cameraPitchDegrees.value,
    );
    const cameraDistance = 1_000;
    resources.camera.position.set(
      Math.sin(yawRadians) * cameraDistance,
      -Math.sin(pitchRadians) * cameraDistance,
      Math.cos(yawRadians) * Math.cos(pitchRadians) * cameraDistance,
    );
    resources.camera.up.set(0, 1, 0);
    resources.camera.lookAt(0, 0, 0);
    resources.renderer.render(resources.scene, resources.camera);
    if (updateHitTargets) this.updateThreeDimensionalHitTargets(bounds);
  }

  protected animateThreeDimensionalTransition() {
    const resources = this.threeDimensionalResources;
    if (!resources?.points) return;
    const material = resources.points.material as THREE.ShaderMaterial;
    const positionAttribute = resources.points.geometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute;
    const startedAt = this.browserWindow.performance.now();
    const durationMilliseconds = this.cssDurationMilliseconds(
      'duration-snapshot-morph',
    );
    const animate = (frameTime: number) => {
      const linearProgress = Math.min(
        1,
        (frameTime - startedAt) / durationMilliseconds,
      );
      const easedProgress = 1 - Math.pow(1 - linearProgress, 3);
      for (
        let positionIndex = 0;
        positionIndex < resources.targetPositions.length;
        positionIndex++
      ) {
        positionAttribute.array[positionIndex] =
          resources.startPositions[positionIndex]! +
          (resources.targetPositions[positionIndex]! -
            resources.startPositions[positionIndex]!) *
            easedProgress;
      }
      positionAttribute.needsUpdate = true;
      material.uniforms.transitionProgress!.value = linearProgress;
      this.renderThreeDimensionalField(
        linearProgress === 0 || linearProgress === 1,
      );
      if (linearProgress < 1 && this.timelineTransition) {
        this.animationFrameIdentifier =
          this.browserWindow.requestAnimationFrame(animate);
      } else {
        this.animationFrameIdentifier = null;
      }
    };
    this.animationFrameIdentifier =
      this.browserWindow.requestAnimationFrame(animate);
  }

  protected cancelThreeDimensionalAnimation() {
    if (this.animationFrameIdentifier !== null) {
      this.browserWindow.cancelAnimationFrame(this.animationFrameIdentifier);
      this.animationFrameIdentifier = null;
    }
  }

  protected updateThreeDimensionalHitTargets(bounds: BrowserBounds) {
    const resources = this.threeDimensionalResources;
    if (!resources?.points) {
      this.threeDimensionalHitTargets.value = [];
      return;
    }
    const positions = resources.points.geometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute;
    this.threeDimensionalHitTargets.value = resources.dots.map(
      (dot, dotIndex) => {
        const projectedPosition = new THREE.Vector3(
          positions.getX(dotIndex),
          positions.getY(dotIndex),
          positions.getZ(dotIndex),
        ).project(resources.camera);
        return {
          identifier: dot.identifier,
          record: dot.record,
          accessibilityLabel: dot.accessibilityLabel,
          className: [
            'three-dimensional-hit-target',
            dot.isSelected ? 'three-dimensional-hit-target-selected' : '',
          ]
            .filter(Boolean)
            .join(' '),
          style: {
            left: `${((projectedPosition.x + 1) / 2) * bounds.width}px`,
            top: `${((1 - projectedPosition.y) / 2) * bounds.height}px`,
          },
        };
      },
    );
  }

  protected pickThreeDimensionalRecord(
    event: BrowserPointerEvent,
    selectRecord: boolean,
  ) {
    const resources = this.threeDimensionalResources;
    const canvas = this.threeDimensionalCanvas.value;
    if (!resources?.points || !canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    resources.raycaster.setFromCamera(pointer, resources.camera);
    const intersection = resources.raycaster.intersectObject(
      resources.points,
    )[0];
    if (intersection?.index === undefined) {
      this.hideTooltip();
      return;
    }
    const dot = resources.dots[intersection.index]!;
    if (selectRecord) this.selectRecord(dot.identifier);
    else this.showThreeDimensionalTooltip(event, dot.record);
  }

  protected directionForKey(key: string): Direction | null {
    if (key === 'ArrowLeft') return { horizontal: -1, vertical: 0 };
    if (key === 'ArrowRight') return { horizontal: 1, vertical: 0 };
    if (key === 'ArrowUp') return { horizontal: 0, vertical: -1 };
    if (key === 'ArrowDown') return { horizontal: 0, vertical: 1 };
    return null;
  }

  protected nearestDot(originDot: FieldDot, direction: Direction) {
    const candidates = this.fieldDots.filter((candidateDot) => {
      const horizontalDelta = candidateDot.x - originDot.x;
      const verticalDelta = candidateDot.y - originDot.y;
      return (
        horizontalDelta * direction.horizontal +
          verticalDelta * direction.vertical >
        0
      );
    });
    return (
      candidates.sort((leftDot, rightDot) => {
        const leftDistance = Math.hypot(
          leftDot.x - originDot.x,
          leftDot.y - originDot.y,
        );
        const rightDistance = Math.hypot(
          rightDot.x - originDot.x,
          rightDot.y - originDot.y,
        );
        return leftDistance - rightDistance;
      })[0] ?? originDot
    );
  }

  protected domainIndex(domain: string) {
    return Math.floor(
      this.stableFraction(domain) * this.constructorClass.DOMAIN_NAMES.length,
    );
  }

  protected recordAngle(record: RankedRecord, domainIndex: number) {
    const sectorWidthRadians =
      (Math.PI * 2) / this.constructorClass.DOMAIN_NAMES.length;
    return (
      -Math.PI / 2 +
      domainIndex * sectorWidthRadians +
      sectorWidthRadians *
        (0.13 + this.stableFraction(record.stableIdentifier) * 0.74)
    );
  }

  protected timelineEventLabel(eventType: TimelineEventType) {
    const labels: Record<TimelineEventType, string> = {
      birth: 'Born',
      strengthen: 'Inward',
      weaken: 'Outward',
      rot: 'Rot',
      removed: 'Removed',
    };
    return labels[eventType];
  }

  protected timelineEventNumber(eventTypes: TimelineEventType[]) {
    const eventType = this.constructorClass.TIMELINE_EVENT_ORDER.find(
      (candidateEventType) => eventTypes.includes(candidateEventType),
    );
    return eventType
      ? this.constructorClass.TIMELINE_EVENT_ORDER.indexOf(eventType) + 1
      : 0;
  }

  protected recordKindNumber(kind: RankedRecord['kind']) {
    if (kind === 'reality-absolute') return 1;
    if (kind === 'reality-renegotiable') return 2;
    return 0;
  }

  protected verificationModeNumber(mode: VerificationMode) {
    const modes: VerificationMode[] = [
      'executed-pass',
      'citation-only',
      'missing',
      'executed-fail',
    ];
    return modes.indexOf(mode);
  }

  protected threeDimensionalPosition(
    fieldX: number,
    fieldY: number,
    domainIndex: number,
  ) {
    return new THREE.Vector3(
      fieldX - this.fieldCenter,
      this.fieldCenter - fieldY,
      (domainIndex - 3.5) * 7,
    );
  }

  protected polarPoint(radius: number, angle: number) {
    return {
      x: this.fieldCenter + radius * Math.cos(angle),
      y: this.fieldCenter + radius * Math.sin(angle),
    };
  }

  protected sectorPath(startAngle: number, endAngle: number) {
    const start = this.polarPoint(this.fieldRadius, startAngle);
    const end = this.polarPoint(this.fieldRadius, endAngle);
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    return [
      `M ${this.fieldCenter} ${this.fieldCenter}`,
      `L ${start.x} ${start.y}`,
      `A ${this.fieldRadius} ${this.fieldRadius} 0 ${largeArc} 1 ${end.x} ${end.y}`,
      'Z',
    ].join(' ');
  }

  protected stableFraction(value: string) {
    let hash = 2_166_136_261;
    for (const character of value) {
      hash ^= character.codePointAt(0)!;
      hash = Math.imul(hash, 16_777_619);
    }
    return (hash >>> 0) / 4_294_967_295;
  }

  protected clamp(value: number, minimum: number, maximum: number) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  protected cssColor(tokenName: string) {
    return this.browserWindow
      .getComputedStyle(this.browserDocument.documentElement)
      .getPropertyValue(`--${tokenName}`)
      .trim();
  }

  protected cssDurationMilliseconds(tokenName: string) {
    const duration = this.cssColor(tokenName);
    return duration.endsWith('ms')
      ? Number.parseFloat(duration)
      : Number.parseFloat(duration) * 1_000;
  }

  protected disposeScene(scene: THREE.Scene) {
    scene.traverse((object) => {
      if (object instanceof THREE.Points || object instanceof THREE.Line) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
  }

  protected threeDimensionalVertexShader() {
    return `
      attribute vec3 domainColor;
      attribute float recordKind;
      attribute float verificationMode;
      attribute float selectedState;
      attribute float rotState;
      attribute float eventType;
      varying vec3 projectedDomainColor;
      varying float projectedRecordKind;
      varying float projectedVerificationMode;
      varying float projectedSelectedState;
      varying float projectedRotState;
      varying float projectedEventType;
      uniform float pointScale;
      void main() {
        projectedDomainColor = domainColor;
        projectedRecordKind = recordKind;
        projectedVerificationMode = verificationMode;
        projectedSelectedState = selectedState;
        projectedRotState = rotState;
        projectedEventType = eventType;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = mix(13.0, 19.0, selectedState) * pointScale;
      }
    `;
  }

  protected threeDimensionalFragmentShader() {
    return `
      precision highp float;
      varying vec3 projectedDomainColor;
      varying float projectedRecordKind;
      varying float projectedVerificationMode;
      varying float projectedSelectedState;
      varying float projectedRotState;
      varying float projectedEventType;
      uniform float transitionProgress;
      uniform vec3 fieldColor;
      uniform vec3 selectionColor;
      uniform vec3 focusColor;
      uniform vec3 rotColor;
      void main() {
        vec2 point = gl_PointCoord * 2.0 - 1.0;
        float circleDistance = length(point);
        float diamondDistance = abs(point.x) + abs(point.y);
        float hexagonDistance = max(abs(point.y), abs(point.x) * 0.866 + abs(point.y) * 0.5);
        float shapeDistance = projectedRecordKind < 0.5
          ? circleDistance
          : projectedRecordKind < 1.5
            ? diamondDistance
            : hexagonDistance;
        float shapeEdge = projectedRecordKind < 1.5 ? 0.66 : 0.72;
        if (shapeDistance > 0.98) discard;
        float core = 1.0 - smoothstep(shapeEdge - 0.08, shapeEdge, shapeDistance);
        float rim = smoothstep(shapeEdge - 0.04, shapeEdge, shapeDistance)
          * (1.0 - smoothstep(0.84, 0.92, shapeDistance));
        float angle = atan(point.y, point.x);
        if (projectedVerificationMode > 0.5 && projectedVerificationMode < 1.5 && point.y < 0.0) {
          rim *= 0.12;
        }
        if (projectedVerificationMode > 1.5 && mod(floor((angle + 3.14159) * 3.2), 2.0) < 1.0) {
          rim *= 0.08;
        }
        vec3 color = mix(fieldColor, projectedDomainColor, core);
        color = mix(color, focusColor, rim * 0.72);
        if (projectedRotState > 0.5 && point.x > 0.0 && abs(point.y) < 0.34) {
          color = mix(color, rotColor, 0.9);
        }
        float selectionRing = smoothstep(0.80, 0.86, circleDistance)
          * (1.0 - smoothstep(0.91, 0.98, circleDistance))
          * projectedSelectedState;
        color = mix(color, selectionColor, selectionRing);
        float eventSignal = projectedEventType > 0.5
          ? sin(transitionProgress * 3.14159)
          : 0.0;
        color = mix(color, projectedEventType > 3.5 ? rotColor : focusColor, eventSignal * 0.65);
        float alpha = max(core, max(rim, selectionRing));
        if (projectedEventType > 4.5) alpha *= 1.0 - transitionProgress;
        if (projectedEventType > 0.5 && projectedEventType < 1.5) alpha *= transitionProgress;
        gl_FragColor = vec4(color, alpha);
      }
    `;
  }

  protected get browserDocument(): BrowserDocument {
    return (globalThis as unknown as { document: BrowserDocument }).document;
  }

  protected get browserWindow(): FieldBrowserWindow {
    return globalThis as unknown as FieldBrowserWindow;
  }

  protected static get DOMAIN_NAMES() {
    return [
      'system',
      'state',
      'interaction',
      'language',
      'data',
      'process',
      'evidence',
      'risk',
    ] as const;
  }

  protected static get TIMELINE_EVENT_ORDER(): readonly TimelineEventType[] {
    return ['birth', 'removed', 'strengthen', 'weaken', 'rot'];
  }
}

export namespace FieldView {
  export const $Class = Static($FieldView);
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}

export interface FieldViewProps {
  snapshot: InvariantSnapshot;
  selectedRecordIdentifier: string | null;
  selectedCompositionIdentifier: string;
  timelineTransition?: TimelineTransition | null;
}

export interface FieldViewEmits {
  (event: 'select-record', recordIdentifier: string): void;
  (event: 'select-composition', compositionIdentifier: string): void;
  (event: 'transition-settled', transitionIdentifier: number): void;
  (event: 'cancel-timeline'): void;
}

interface FieldDot {
  identifier: string;
  record: RankedRecord;
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  traceStartX: number;
  traceStartY: number;
  labelX: number;
  labelY: number;
  labelKey: string;
  transform: string;
  domainIndex: number;
  visualRadius: number;
  accessibilityLabel: string;
  className: string;
  traceClassName: string;
  style: Record<string, string>;
  eventTypes: TimelineEventType[];
  isRealityAbsolute: boolean;
  isRealityRenegotiable: boolean;
  isChosen: boolean;
  isSelected: boolean;
  hasTimelineEvent: boolean;
  hasRot: boolean;
}

interface FieldTooltip {
  name: string;
  contractPath: string;
  rankAndRadius: string;
  left: number;
  top: number;
}

interface Direction {
  horizontal: number;
  vertical: number;
}

interface ThreeDimensionalHitTarget {
  identifier: string;
  record: RankedRecord;
  accessibilityLabel: string;
  className: string;
  style: Record<string, string>;
}

interface ThreeDimensionalResources {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  raycaster: THREE.Raycaster;
  points: THREE.Points | null;
  dots: FieldDot[];
  startPositions: Float32Array;
  targetPositions: Float32Array;
}

interface BrowserDocument {
  documentElement: BrowserElement;
  querySelector(selector: string): BrowserElement | null;
}

interface BrowserElement {
  focus(): void;
  getBoundingClientRect(): BrowserBounds;
}

interface BrowserCanvasElement extends BrowserElement {
  releasePointerCapture(pointerIdentifier: number): void;
  setPointerCapture(pointerIdentifier: number): void;
}

interface BrowserBounds {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

interface BrowserKeyboardEvent extends Event {
  key: string;
}

interface BrowserPointerEvent extends Event {
  button: number;
  clientX: number;
  clientY: number;
  pointerId: number;
}

interface BrowserResizeObserver {
  disconnect(): void;
  observe(element: BrowserCanvasElement): void;
}

interface BrowserComputedStyle {
  getPropertyValue(propertyName: string): string;
}

interface FieldBrowserWindow {
  devicePixelRatio?: number;
  performance: {
    now(): number;
  };
  matchMedia?(query: string): {
    matches: boolean;
  };
  ResizeObserver: new (callback: () => void) => BrowserResizeObserver;
  getComputedStyle(element: BrowserElement): BrowserComputedStyle;
  queueMicrotask(callback: () => void): void;
  requestAnimationFrame(callback: (frameTime: number) => void): number;
  cancelAnimationFrame(identifier: number): void;
}

type ThreeDimensionalRendererCanvas = NonNullable<
  ConstructorParameters<typeof THREE.WebGLRenderer>[0]
>['canvas'];

type FieldMode = 'two-dimensional' | 'three-dimensional';
