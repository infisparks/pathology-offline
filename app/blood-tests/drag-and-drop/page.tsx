"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react"
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragOverlay, UniqueIdentifier } from "@dnd-kit/core"
import { sortableKeyboardCoordinates, SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, Move, GripVertical, FileText } from "lucide-react"
import { generateReportPdf } from "@/app/download-report/pdf-generator"
import type { PatientData, BloodTestData } from "@/app/download-report/types/report"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { supabase } from "@/lib/supabase"
import { useForm, useFieldArray, useWatch, Control, FieldErrorsImpl, UseFormRegister, UseFormGetValues, UseFormSetValue } from "react-hook-form"
import { useDroppable } from "@dnd-kit/core"
import { Badge } from "@/components/ui/badge"

// Local interfaces for the form structure of a new test
export interface BloodTestParameter {
  id: UniqueIdentifier; // Add id for dnd-kit
  type: "parameter"; // Explicitly add type
  name: string
  unit: string
  valueType: "text" | "number"
  defaultValue?: string | number
  formula?: string
  iscomment?: boolean
  range: {
    male: Array<{ rangeKey: string; rangeValue: string }>
    female: Array<{ rangeKey: string; rangeValue: string }>
  }
  suggestions?: Array<{ description: string; shortName: string }>
}

export interface BloodTestSubheading {
  id: UniqueIdentifier; // Add id for dnd-kit
  type: "subheading"; // Explicitly add type
  title: string
  parameterNames: Array<{ name: string; id: UniqueIdentifier }> // Store name and id to reference parameters
  is100?: boolean
}

export interface NewTestFormInputs {
  testName: string
  price: number
  tpa_price?: number
  isOutsource: boolean
  parameters: BloodTestParameter[]
  subheadings: BloodTestSubheading[]
  interpretation?: string
}

interface DraggableSourceItem {
  id: UniqueIdentifier
  type: "parameter" | "subheading"
  name: string
  data?: any // To hold initial default data for new parameters/subheadings
}

// Generic type for items in the droppable area, which can be parameters or subheadings
type DroppableItem = BloodTestParameter | BloodTestSubheading;

interface DroppableAreaProps {
  id: string
  items: DroppableItem[]
  title: string
  control: Control<NewTestFormInputs>;
  register: UseFormRegister<NewTestFormInputs>;
  errors: FieldErrorsImpl<NewTestFormInputs>;
  removeParameter: (index?: number | number[]) => void;
  removeSubheading: (index?: number | number[]) => void;
  parameterFields: BloodTestParameter[];
  subheadingFields: BloodTestSubheading[];
}

// Component to render individual draggable/sortable items in the test structure
function SortableItem({ item }: { item: DraggableSourceItem | DroppableItem }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="flex items-center p-2 mb-2 bg-white border border-gray-200 rounded-md shadow-sm"
    >
      <button className="mr-2 cursor-grab" {...listeners}>
        <GripVertical className="h-4 w-4 text-gray-500" />
      </button>
      <div className="flex flex-col items-start">
        <span className="font-medium">
          {'title' in item ? item.title : // For BloodTestSubheading
           'name' in item ? item.name : // For BloodTestParameter and DraggableSourceItem
           'Unknown'}
        </span>
        {item.type === "parameter" && 'unit' in item && item.unit && (
          <span className="ml-0 text-xs text-gray-500">({item.unit})</span>
        )}
        {item.type === "subheading" && 'parameterNames' in item && item.parameterNames && item.parameterNames.length > 0 && (
          <span className="ml-0 text-xs text-gray-500">({item.parameterNames.length} parameters)</span>
        )}
        {/* For source items (DraggableSourceItem) if they had data, though now they are generic */}
        {item.type === "parameter" && 'data' in item && item.data?.unit && (
          <span className="ml-0 text-xs text-gray-500">({item.data.unit})</span>
        )}
      </div>
    </div>
  );
}

interface EditableParameterItemProps {
  index: number;
  control: Control<NewTestFormInputs>;
  register: UseFormRegister<NewTestFormInputs>;
  errors: FieldErrorsImpl<NewTestFormInputs>;
  remove: (index?: number | number[]) => void;
  onClose: () => void; // Callback to close modal
}

const EditableParameterItem: React.FC<EditableParameterItemProps> = ({ index, control, register, errors, remove, onClose }) => {
  const maleRangesArray = useFieldArray({
    control,
    name: `parameters.${index}.range.male`,
  });
  const femaleRangesArray = useFieldArray({
    control,
    name: `parameters.${index}.range.female`,
  });
  const suggestionsArray = useFieldArray({
    control,
    name: `parameters.${index}.suggestions`,
  });

  // Helper to safely fetch error messages (re-used from blood-tests/page.tsx)
  const getFieldErrorMessage = (formErrors: any, path: string[]): string | undefined => {
    let current = formErrors;
    for (const p of path) {
      if (!current) return undefined;
      current = current[p];
    }
    return typeof current?.message === "string" ? current.message : undefined;
  };

  const paramNameErr = getFieldErrorMessage(errors, [`parameters`, index.toString(), `name`]);
  const paramUnitErr = getFieldErrorMessage(errors, [`parameters`, index.toString(), `unit`]);
  const paramValueTypeErr = getFieldErrorMessage(errors, [`parameters`, index.toString(), `valueType`]);

  return (
    <div className="p-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Edit Parameter: {control._formValues.parameters[index]?.name || 'New Parameter'}</h3>
        <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-700">
          <Plus className="h-5 w-5 rotate-45" />
        </button>
      </div>

      <div className="mt-4">
        <label className="block text-sm font-medium">Parameter Name</label>
        <input
          type="text"
          {...register(`parameters.${index}.name`, { required: "Required" })}
          className="w-full border rounded px-3 py-2"
        />
        {paramNameErr && <p className="text-red-500 text-xs">{paramNameErr}</p>}
      </div>
      <div className="mt-2">
        <label className="block text-sm font-medium">Unit</label>
        <input type="text" {...register(`parameters.${index}.unit`)} className="w-full border rounded px-3 py-2" />
        {paramUnitErr && <p className="text-red-500 text-xs">{paramUnitErr}</p>}
      </div>

      <div className="mt-2">
        <label className="block text-sm font-medium">Value Type</label>
        <select
          {...register(`parameters.${index}.valueType`, { required: "Required" })}
          className="w-full border rounded px-3 py-2"
        >
          <option value="">Select Value Type</option>
          <option value="text">Text</option>
          <option value="number">Number</option>
        </select>
        {paramValueTypeErr && <p className="text-red-500 text-xs">{paramValueTypeErr}</p>}
      </div>

      <div className="mt-2">
        <label className="block text-sm font-medium">Formula (optional)</label>
        <input
          type="text"
          {...register(`parameters.${index}.formula`)}
          placeholder="e.g. TOTAL BILLIRUBIN - DIRECT BILLIRUBIN"
          className="w-full border rounded px-3 py-2"
        />
      </div>

      <div className="mt-2">
        <label className="block text-sm font-medium">Default Value</label>
        <input
          type="text"
          {...register(`parameters.${index}.defaultValue`)}
          className="w-full border rounded px-3 py-2"
          placeholder="e.g. 0 or N/A"
        />
      </div>

      <div className="mt-2 flex items-center space-x-2">
        <input type="checkbox" {...register(`parameters.${index}.iscomment`)} id={`comment-${index}`} />
        <label htmlFor={`comment-${index}`} className="text-sm">
          This row is a comment (store <code>iscomment: true</code>)
        </label>
      </div>

      <div className="mt-4">
        <h4 className="text-md font-medium">Suggestions</h4>
        {suggestionsArray.fields.map((field, sIndex) => (
          <div key={field.id} className="flex items-center space-x-2 mt-1">
            <input
              type="text"
              placeholder="Full suggestion text"
              {...register(`parameters.${index}.suggestions.${sIndex}.description`)}
              className="w-2/3 border rounded px-2 py-1 text-sm"
            />
            <input
              type="text"
              placeholder="Short code"
              {...register(`parameters.${index}.suggestions.${sIndex}.shortName`)}
              className="w-1/3 border rounded px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={() => suggestionsArray.remove(sIndex)}
              className="text-red-500 hover:text-red-700 p-1"
            >
              <Plus className="h-4 w-4 rotate-45" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => suggestionsArray.append({ description: "", shortName: "" })}
          className="mt-2 inline-flex items-center px-4 py-2 border border-green-600 text-green-600 rounded hover:bg-green-50 text-sm"
        >
          <Plus className="mr-1" /> Add Suggestion
        </button>
      </div>

      <div className="mt-4">
        <h4 className="text-md font-medium">Male Ranges</h4>
        {maleRangesArray.fields.map((field, mIndex) => (
          <div key={field.id} className="flex items-center space-x-2 mt-1">
            <input
              type="text"
              placeholder="Range Key (e.g., 0-1y)"
              {...register(`parameters.${index}.range.male.${mIndex}.rangeKey`)}
              className="w-1/2 border rounded px-2 py-1 text-sm"
            />
            <input
              type="text"
              placeholder="Range Value (e.g., 10-20)"
              {...register(`parameters.${index}.range.male.${mIndex}.rangeValue`)}
              className="w-1/2 border rounded px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={() => maleRangesArray.remove(mIndex)}
              className="text-red-500 hover:text-red-700 p-1"
            >
              <Plus className="h-4 w-4 rotate-45" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => maleRangesArray.append({ rangeKey: "", rangeValue: "" })}
          className="mt-2 inline-flex items-center px-4 py-2 border border-blue-600 text-blue-600 rounded hover:bg-blue-50 text-sm"
        >
          <Plus className="mr-1" /> Add Male Range
        </button>
      </div>

      <div className="mt-4">
        <h4 className="text-md font-medium">Female Ranges</h4>
        {femaleRangesArray.fields.map((field, fIndex) => (
          <div key={field.id} className="flex items-center space-x-2 mt-1">
            <input
              type="text"
              placeholder="Range Key (e.g., 0-1y)"
              {...register(`parameters.${index}.range.female.${fIndex}.rangeKey`)}
              className="w-1/2 border rounded px-2 py-1 text-sm"
            />
            <input
              type="text"
              placeholder="Range Value (e.g., 10-20)"
              {...register(`parameters.${index}.range.female.${fIndex}.rangeValue`)}
              className="w-1/2 border rounded px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={() => femaleRangesArray.remove(fIndex)}
              className="text-red-500 hover:text-red-700 p-1"
            >
              <Plus className="h-4 w-4 rotate-45" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => femaleRangesArray.append({ rangeKey: "", rangeValue: "" })}
          className="mt-2 inline-flex items-center px-4 py-2 border border-blue-600 text-blue-600 rounded hover:bg-blue-50 text-sm"
        >
          <Plus className="mr-1" /> Add Female Range
        </button>
      </div>

      <div className="flex justify-end mt-6">
        <Button type="button" onClick={onClose}>Done</Button>
      </div>
    </div>
  );
};

interface EditableSubheadingItemProps {
  index: number;
  control: Control<NewTestFormInputs>;
  register: UseFormRegister<NewTestFormInputs>;
  errors: FieldErrorsImpl<NewTestFormInputs>;
  remove: (index?: number | number[]) => void;
  allParameters: BloodTestParameter[]; // Pass all parameters for selection
  onClose: () => void; // Callback to close modal
}

const EditableSubheadingItem: React.FC<EditableSubheadingItemProps> = ({
  index, control, register, errors, remove, allParameters, onClose
}) => {
  const parameterNamesArray = useFieldArray({
    control,
    name: `subheadings.${index}.parameterNames`,
  });

  const { setNodeRef, isOver } = useDroppable({ id: control._formValues.subheadings[index]?.id || `subheading-droppable-${index}` });

  // Helper to safely fetch error messages (re-used from blood-tests/page.tsx)
  const getFieldErrorMessage = (formErrors: any, path: string[]): string | undefined => {
    let current = formErrors;
    for (const p of path) {
      if (!current) return undefined;
      current = current[p];
    }
    return typeof current?.message === "string" ? current.message : undefined;
  };

  const subheadingTitleErr = getFieldErrorMessage(errors, [`subheadings`, index.toString(), `title`]);

  const availableParameters = allParameters.filter(p => {
    // Filter out parameters already added to this subheading
    const currentSubheadingParams = control._formValues.subheadings[index]?.parameterNames.map((pn: { id: UniqueIdentifier }) => pn.id) || [];
    return !currentSubheadingParams.includes(p.id);
  });

  return (
    <div className={`p-4 ${isOver ? 'bg-blue-50 border-blue-400' : ''}`} ref={setNodeRef}> {/* Apply isOver styling and ref */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Edit Subheading: {control._formValues.subheadings[index]?.title || 'New Subheading'}</h3>
        <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-700">
          <Plus className="h-5 w-5 rotate-45" />
        </button>
      </div>

      <div className="mt-4">
        <label className="block text-sm font-medium">Subheading Title</label>
        <input
          type="text"
          {...register(`subheadings.${index}.title`, { required: "Required" })}
          className="w-full border rounded px-3 py-2"
          placeholder="e.g. RBC"
        />
        {subheadingTitleErr && <p className="text-red-500 text-xs">{subheadingTitleErr}</p>}
      </div>

      <div className="mt-2 flex items-center space-x-2">
        <input type="checkbox" {...register(`subheadings.${index}.is100`)} id={`is100-${index}`} />
        <label htmlFor={`is100-${index}`} className="text-sm">
          This subheading's parameters sum to 100% (e.g., Differential Count)
        </label>
      </div>

      <div className="mt-4">
        <h4 className="text-md font-medium">Parameters in this Subheading:</h4>
        <p className="text-sm text-gray-500 italic mb-2">Drag parameters here to group them under this subheading.</p>
        <div className="flex flex-wrap gap-2 mb-2">
          {parameterNamesArray.fields.map((field, pIndex) => (
            <Badge key={field.id} className="text-sm flex items-center">
              {allParameters.find(p => p.id === field.id)?.name || field.name}
              <button
                type="button"
                onClick={() => parameterNamesArray.remove(pIndex)}
                className="ml-1 text-red-500 hover:text-red-700 p-1 rounded-full"
              >
                <Plus className="h-3 w-3 rotate-45" />
              </button>
            </Badge>
          ))}
        </div>
        <select
          className="w-full border rounded px-3 py-2 text-sm"
          onChange={(e) => {
            const selectedParamId = e.target.value;
            const selectedParam = allParameters.find(p => p.id === selectedParamId);
            if (selectedParam) {
              parameterNamesArray.append({ name: selectedParam.name, id: selectedParam.id });
              e.target.value = ""; // Reset select
            }
          }}
          value="" // Controlled component needs a value
        >
          <option value="">Add Parameter to Subheading</option>
          {availableParameters.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex justify-end mt-6">
        <Button type="button" onClick={onClose}>Done</Button>
      </div>
    </div>
  );
};

function DroppableArea({ id, items, title, control, register, errors, removeParameter, removeSubheading, parameterFields, subheadingFields }: DroppableAreaProps) {
  const { setNodeRef } = useDroppable({ id });
  const [editingItem, setEditingItem] = useState<DroppableItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleEditDetails = useCallback((item: DroppableItem) => {
    setEditingItem(item);
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingItem(null);
  }, []);

  const currentEditingIndex = editingItem
    ? (editingItem.type === "parameter"
      ? parameterFields.findIndex(p => p.id === editingItem.id)
      : subheadingFields.findIndex(s => s.id === editingItem.id))
    : -1;

  return (
    <Card className="flex-1">
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent ref={setNodeRef} className="min-h-[200px] border-2 border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
        {items.length === 0 && <p className="text-gray-500 text-center ">Drag items here</p>}
        <SortableContext items={items.map(item => String(item.id))} strategy={verticalListSortingStrategy}> {/* Explicitly cast ID to string */}
          {items.map((item, itemIndex) => (
            <div key={item.id} className="border border-gray-200 rounded-lg mb-2 p-1.5 flex items-center justify-between">
              <div className="flex items-center flex-grow">
                <SortableItem item={item} />
                <span className="ml-2 font-medium">{'name' in item ? item.name : 'title' in item ? item.title : ''}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleEditDetails(item)}
                className="ml-4"
              >
                Add Details
              </Button>
            </div>
          ))}
        </SortableContext>
      </CardContent>
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem?.type === "parameter" ? "Edit Parameter Details" : "Edit Subheading Details"}</DialogTitle>
          </DialogHeader>
          {editingItem && currentEditingIndex !== -1 && (
            editingItem.type === "parameter" ? (
              <EditableParameterItem
                index={currentEditingIndex}
                control={control}
                register={register}
                errors={errors}
                remove={removeParameter}
                onClose={handleCloseModal}
              />
            ) : (
              <EditableSubheadingItem
                index={currentEditingIndex}
                control={control}
                register={register}
                errors={errors}
                remove={removeSubheading}
                allParameters={parameterFields as BloodTestParameter[]} // Pass all parameters
                onClose={handleCloseModal}
              />
            )
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function DragAndDropTestBuilder() {
  const [draggableSourceItems, setDraggableSourceItems] = useState<DraggableSourceItem[]>([])
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);

  // react-hook-form setup for the main test structure
  const { register, handleSubmit, control, getValues, setValue, formState: { errors } } = useForm<NewTestFormInputs>({
    defaultValues: {
      testName: "New Blood Test",
      price: 0,
      isOutsource: false,
      parameters: [],
      subheadings: [],
      interpretation: "",
    }
  });

  // Watch all form fields for real-time preview updates
  const watchAllFields = useWatch({ control });

  useEffect(() => {
    // Trigger preview generation whenever form data changes
    generatePreview();
  }, [watchAllFields]); // Dependency on watched fields

  const { fields: parameterFields, append: appendParameter, remove: removeParameter, move: moveParameter, insert: insertParameter } = useFieldArray({
    control,
    name: "parameters",
  });

  const { fields: subheadingFields, append: appendSubheading, remove: removeSubheading, move: moveSubheading, insert: insertSubheading } = useFieldArray({
    control,
    name: "subheadings",
  });

  // Combined list of items in the droppable area for rendering and sorting
  const testStructureItems: DroppableItem[] = useMemo(() => {
    // Create a combined array of all parameters and subheadings with their original indices
    const combined = [
        ...parameterFields.map((p, idx) => ({ ...p, type: "parameter" as const, originalIndex: idx })),
        ...subheadingFields.map((s, idx) => ({ ...s, type: "subheading" as const, originalIndex: idx })),
      ];

    // Sort them based on their desired display order. This is where you would introduce a custom order if needed.
    // For now, we'll just return them as is, assuming react-hook-form maintains order on append/move.
    return combined.sort((a, b) => a.originalIndex - b.originalIndex);
  }, [parameterFields, subheadingFields]);

  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  // DndContext sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Dummy data for draggable source items
  useEffect(() => {
    setDraggableSourceItems([
      { id: "source-param", type: "parameter", name: "Add Parameter" },
      { id: "source-subhead", type: "subheading", name: "Add Subheading" },
    ]);
  }, []);

  const handleDragStart = useCallback((event: any) => {
    setActiveId(event.active.id);
  }, []);

  const handleDragEnd = useCallback((event: any) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return; // Dropped outside any droppable area

    const isDraggingFromSource = draggableSourceItems.some(item => item.id === active.id);
    const isDroppedInTestStructure = over.id === 'test-structure-dropzone' || testStructureItems.some(item => item.id === over.id);

    // Check if dropping a parameter into a subheading
    const activeItem = testStructureItems.find(item => item.id === active.id);
    const targetSubheading = subheadingFields.find(sub => sub.id === over.id);

    if (activeItem?.type === "parameter" && targetSubheading) {
      // A parameter is being dropped directly onto a subheading
      const paramIndexInMainList = parameterFields.findIndex(p => p.id === activeItem.id);
      if (paramIndexInMainList !== -1) {
        // Remove from main parameter list
        removeParameter(paramIndexInMainList);
      }

      // Add to subheading's parameterNames
      const subheadingIndex = subheadingFields.findIndex(s => s.id === targetSubheading.id);
      if (subheadingIndex !== -1) {
        const currentParamNames = getValues(`subheadings.${subheadingIndex}.parameterNames`);
        const paramToAdd = { id: activeItem.id, name: activeItem.name }; // Use name from the active item
        // Only add if not already present
        if (!currentParamNames.some(p => p.id === paramToAdd.id)) {
          setValue(`subheadings.${subheadingIndex}.parameterNames`, [...currentParamNames, paramToAdd]);
        }
      }
    } else if (isDraggingFromSource && isDroppedInTestStructure) {
      // Original logic for dropping new item from source into main structure
      const sourceItem = draggableSourceItems.find(item => item.id === active.id);
      if (sourceItem) {
        const newId = `${sourceItem.type}-${Date.now()}`;
        const newIndex = over.id === 'test-structure-dropzone' ? testStructureItems.length : testStructureItems.findIndex(item => item.id === over.id);

        if (sourceItem.type === "parameter") {
          insertParameter(newIndex, {
            id: newId,
            type: "parameter",
            name: "", // Default empty name
            unit: "", // Default empty unit
            valueType: "text", // Default to text
            defaultValue: "",
            formula: "",
            iscomment: false,
            range: { male: [], female: [] }, // Empty ranges
            suggestions: [], // Empty suggestions
          });
        } else if (sourceItem.type === "subheading") {
          insertSubheading(newIndex, {
            id: newId,
            type: "subheading",
            title: "", // Default empty title
            parameterNames: [], // Empty parameter names
            is100: false,
          });
        }
      }
    } else if (active.id !== over.id && isDroppedInTestStructure) {
      // Reordering within the test structure (or moving from source to specific position)
      const oldIndex = testStructureItems.findIndex(item => item.id === active.id);
      const newIndex = testStructureItems.findIndex(item => item.id === over.id);

      if (oldIndex === -1 || newIndex === -1) return;

      const activeItem = testStructureItems[oldIndex];

      if (activeItem.type === "parameter") {
        const originalParameterIndex = parameterFields.findIndex(p => p.id === activeItem.id);
        if (originalParameterIndex !== -1) {
          moveParameter(originalParameterIndex, newIndex);
        }
      } else if (activeItem.type === "subheading") {
        const originalSubheadingIndex = subheadingFields.findIndex(s => s.id === activeItem.id);
        if (originalSubheadingIndex !== -1) {
          moveSubheading(originalSubheadingIndex, newIndex);
        }
      }
    }
  }, [draggableSourceItems, insertParameter, insertSubheading, moveParameter, moveSubheading, removeParameter, testStructureItems, parameterFields, subheadingFields, getValues, setValue]); // Added new deps


  const generatePreview = async () => {
    const currentFormData = getValues(); // Get current form data from react-hook-form

    // Construct dummy PatientData based on current form structure
    const dummyParameters: any[] = currentFormData.parameters.map(p => ({
      name: p.name,
      unit: p.unit,
      value: p.valueType === "number" ? 1 : "Dummy Text Value", // Dummy value
      range: Array.isArray(p.range.male) && p.range.male.length > 0 ? p.range.male[0].rangeValue : "", // Use first male range as dummy
      formula: p.formula,
      iscomment: p.iscomment,
      valueType: p.valueType,
    }));

    const dummySubheadings: any[] = currentFormData.subheadings.map(sh => ({
      title: sh.title,
      parameterNames: sh.parameterNames.map(pn => pn.name), // Extract names
      is100: sh.is100,
    }));

    const dummyBloodtestDetail: Record<string, BloodTestData> = {
      [currentFormData.testName.toLowerCase().replace(/\s+/g, "_").replace(/[.#$[\]()]/g, "").replace(/\//g, "")]: {
        testId: "dummy-id",
        parameters: dummyParameters as any, // Cast to any to bypass strict type checking temporarily
        subheadings: dummySubheadings as any, // Cast to any to bypass strict type checking temporarily
        reportedOn: new Date().toISOString(),
        enteredBy: "Dummy User",
        type: currentFormData.isOutsource ? "outsource" : "inhouse",
        descriptions: [],
        interpretation: currentFormData.interpretation || "Dummy interpretation for " + currentFormData.testName,
      }
    };

    const dummyPatientData: PatientData = {
      id: 1,
      name: "Sample Patient",
      age: 30,
      gender: "Male",
      patientId: "SP-001",
      contact: "9876543210",
      total_day: "30",
      day_type: "day",
      title: "Mr.",
      doctorName: "Dr. Test",
      hospitalName: "Test Hospital",
      registration_id: 1001,
      createdAt: new Date().toISOString(),
      sampleCollectedAt: new Date().toISOString(),
      bloodtest_data: [{ testId: "dummy-id", testName: currentFormData.testName, price: currentFormData.price }],
      bloodtest_detail: dummyBloodtestDetail,
      bloodtest: dummyBloodtestDetail,
    }

    try {
      const blob = await generateReportPdf(
        dummyPatientData,
        Object.keys(dummyPatientData.bloodtest || {}),
        [], // combinedGroups
        {}, // historicalTestsData
        {}, // comparisonSelections
        "normal", // reportType
        true, // includeLetterhead
        true, // skipCover
        undefined, // aiSuggestions
        false, // Include AI suggestions page
      )
      const url = URL.createObjectURL(blob)
      setPdfUrl(url)
      // setShowPreviewModal(true) // Removed - no longer using a preview modal
    } catch (error) {
      console.error("Error generating preview PDF:", error)
      alert("Failed to generate preview.")
    }
  }
  
  const onSubmit = async (data: NewTestFormInputs) => {
    console.log("Form submitted:", data);
    
    // 1. Transform parameters: remove 'id' and 'type'
    const parametersForSupabase = data.parameters.map(({ id, type, ...rest }) => rest);

    // 2. Transform subheadings: remove 'id' and 'type', and transform 'parameterNames'
    const subheadingsForSupabase = data.subheadings.map(({ id, type, parameterNames, ...rest }) => ({
      ...rest,
      parameterNames: parameterNames.map(p => p.name), // Extract only the name string
    }));

    const payload = {
      test_name: data.testName,
      price: data.price,
      tpa_price: data.tpa_price || null, // Ensure null if undefined/null
      outsource: data.isOutsource,
      parameter: parametersForSupabase, // Use transformed parameters
      sub_heading: subheadingsForSupabase, // Use transformed subheadings
      interpretation: data.interpretation || null, // Ensure null if empty
    };

    console.log("Payload for Supabase:", payload);

    try {
      const { error } = await supabase.from("blood_test").insert([payload]);

      if (error) {
        throw error;
      }

      alert("Test created successfully!");
      console.log("Test created successfully!");
      // Optionally, clear the form or redirect the user
      // reset(); // if you want to clear the form
    } catch (err: any) {
      console.error("Error saving test:", err.message);
      alert(`Error saving test: ${err.message}`);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 p-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Create Test (Drag & Drop)</h1>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 gap-6">
          {/* Draggable Parameters Column */}
          <Card className="w-1/4">
            <CardHeader>
              <CardTitle className="text-lg">Available Elements</CardTitle>
            </CardHeader>
            <CardContent>
              <SortableContext id="available-elements" items={draggableSourceItems.map(item => item.id)} strategy={verticalListSortingStrategy}>
                {draggableSourceItems.map((item) => (
                  <SortableItem key={item.id} item={item} />
                ))}
              </SortableContext>
              <p className="mt-4 text-sm text-gray-500">Drag items from here into the test structure.</p>
            </CardContent>
          </Card>

          {/* Drop Zone / Test Structure Column */}
          <div className="flex-1 flex flex-col gap-6">
            <DroppableArea 
              id="test-structure-dropzone" 
              items={testStructureItems} 
              title="Build Your Test Structure" 
              control={control}
              register={register}
              errors={errors}
              removeParameter={removeParameter}
              removeSubheading={removeSubheading}
              parameterFields={parameterFields as any} // Cast to any to bypass type issues here for now
              subheadingFields={subheadingFields as any} // Cast to any to bypass type issues here for now
            />

            {/* Test Name and other overall test details */}
            <Card>
              <CardHeader><CardTitle className="text-lg">Test Details</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" id="test-details-form"> {/* Added id to form */}
                  <div>
                    <label className="block text-sm font-medium">Test Name</label>
                    <input type="text" {...register("testName", { required: "Test name is required" })} className="w-full border rounded px-3 py-2" />
                    {errors.testName && <p className="text-red-500 text-xs">{errors.testName.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium">Price (Rs.)</label>
                    <input type="number" step="0.01" {...register("price", { required: "Price is required", valueAsNumber: true })} className="w-full border rounded px-3 py-2" />
                    {errors.price && <p className="text-red-500 text-xs">{errors.price.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium">TPA Price (Optional)</label>
                    <input type="number" step="0.01" {...register("tpa_price", { valueAsNumber: true })} className="w-full border rounded px-3 py-2" placeholder="Enter TPA price if any" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium">
                      Outsource Test?
                      <input type="checkbox" {...register("isOutsource")} className="ml-2" />
                    </label>
                  </div>
                  {/* Interpretation field */}
                  <div>
                    <label className="block text-sm font-medium">Interpretation</label>
                    <textarea {...register("interpretation")}
                      className="w-full border rounded px-3 py-2 h-24"
                      placeholder="Enter test interpretation or remarks..."
                    ></textarea>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* JSON Copy Button */}
            <Button
              type="button"
              onClick={async () => {
                try {
                  const currentFormData = getValues();
                  // Transform data for Supabase format (similar to onSubmit)
                  const parametersForSupabase = currentFormData.parameters.map(({ id, type, ...rest }) => rest);
                  const subheadingsForSupabase = currentFormData.subheadings.map(({ id, type, parameterNames, ...rest }) => ({
                    ...rest,
                    parameterNames: parameterNames.map(p => p.name),
                  }));

                  const payload = {
                    test_name: currentFormData.testName,
                    price: currentFormData.price,
                    tpa_price: currentFormData.tpa_price || null,
                    outsource: currentFormData.isOutsource,
                    parameter: parametersForSupabase,
                    sub_heading: subheadingsForSupabase,
                    interpretation: currentFormData.interpretation || null,
                  };
                  await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
                  alert("JSON copied to clipboard!");
                } catch (error) {
                  console.error("Failed to copy JSON:", error);
                  alert("Failed to copy JSON. See console for details.");
                }
              }}
              className="bg-gray-600 hover:bg-gray-700 mt-2 self-end"
            >
              <FileText className="h-5 w-5 mr-2" /> Copy Report JSON
            </Button>

            {/* Save Button */}
            <Button type="submit" form="test-details-form" className="bg-green-600 hover:bg-green-700 mt-2 self-end">
              <Plus className="h-5 w-5 mr-2" /> Save New Test
            </Button>

          </div>

          {/* Real-time Preview Column */}
          <Card className="w-1/2">
            <CardHeader>
              <CardTitle className="text-lg">Real-time Preview (Letterhead)</CardTitle>
            </CardHeader>
            <CardContent className="h-[700px] flex items-center justify-center bg-gray-200 rounded-lg overflow-hidden">
              {pdfUrl ? (
                <iframe src={pdfUrl} className="w-full h-full" />
              ) : (
                <p className="text-gray-500">Preview will appear here</p>
              )}
            </CardContent>
          </Card>
        </div>

        <DragOverlay>
          {activeId ? <SortableItem item={draggableSourceItems.find(item => item.id === activeId) || testStructureItems.find(item => item.id === activeId) || {} as any} /> : null}
        </DragOverlay>
      </DndContext>

      {/* Preview Modal - This modal is now only for the final PDF preview, not for editing */}
      {/*
      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Report Preview</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            {pdfUrl ? (
              <iframe src={pdfUrl} className="w-full h-full" />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">Loading preview...</div>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowPreviewModal(false)
                if (pdfUrl) URL.revokeObjectURL(pdfUrl)
                setPdfUrl(null)
              }}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      */}
    </div>
  );
}